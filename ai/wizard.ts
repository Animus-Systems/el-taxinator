import { randomUUID } from "node:crypto"
import { requestLLM, type LLMResponse } from "./providers/llmProvider"
import { buildWizardPrompt, getWizardReplySchema, WIZARD_PROMPT_VERSION } from "./wizard-prompt"
import type { TransactionCandidate } from "./import-csv"
import {
  wizardAssistantReplySchema,
  type BulkAction,
  type CandidateUpdate,
  type EntityType,
  type ImportSession,
  type WizardAssistantReply,
  type WizardMessage,
} from "@/lib/db-types"
import { getCategories } from "@/models/categories"
import { getProjects } from "@/models/projects"
import { getActiveAccounts } from "@/models/accounts"
import { getActiveRules } from "@/models/rules"
import { listPacks as listKnowledgePacks } from "@/models/knowledge-packs"
import { getSettings, getLLMSettings } from "@/models/settings"
import { listBusinessFacts, hasAnyBusinessFacts, upsertBusinessFact } from "@/models/business-facts"
import { recordAnalysis } from "@/models/ai-analysis-results"
import {
  getImportSessionById,
  updateImportSession,
  setBusinessContextSnapshot,
} from "@/models/import-sessions"
import { getUserById } from "@/models/users"

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type ProcessTurnInput = {
  userId: string
  sessionId: string
  userMessage: string
  focusRowIndexes?: number[] | null
  locale?: string
}

export type ProcessTurnResult = {
  reply: WizardAssistantReply
  ruleConflictNotes: string[]
  promptVersion: string
}

/**
 * Drives one conversational turn against the LLM. The caller is expected to
 * have already (a) acquired the per-session lock and (b) appended the user
 * message to `messages`. This function:
 *   - loads context (facts, categories, projects, rules, session)
 *   - assembles the prompt and calls requestLLM
 *   - validates and parses the structured reply
 *   - applies candidate updates to session.data and persists
 *   - records ai_analysis_results for each updated candidate
 *   - upserts business_facts the model proposed
 * The caller is responsible for appending the assistant message to `messages`
 * (using the returned reply) and clearing the lock.
 */
export async function processWizardTurn(input: ProcessTurnInput): Promise<ProcessTurnResult> {
  const session = await getImportSessionById(input.sessionId, input.userId)
  if (!session) throw new Error("Wizard session not found")

  const [user, settings, businessFacts, categories, projects, accounts, rules, knowledgePacks] =
    await Promise.all([
      getUserById(input.userId),
      getSettings(input.userId),
      listBusinessFacts(input.userId),
      getCategories(input.userId),
      getProjects(input.userId),
      getActiveAccounts(input.userId),
      getActiveRules(input.userId),
      listKnowledgePacks(input.userId),
    ])

  if (!user) throw new Error("Wizard turn: user not found")

  const candidates = readSessionCandidates(session)
  const messages = readSessionMessages(session)

  const { prompt, promptVersion } = buildWizardPrompt({
    entityType: (user.entityType as EntityType | null) ?? null,
    businessName: user.businessName,
    locale: input.locale ?? settings["language"] ?? "en",
    businessFacts,
    categories,
    projects,
    accounts,
    rules,
    knowledgePacks,
    candidates,
    focusRowIndexes: input.focusRowIndexes ?? null,
    messages,
    userMessage: input.userMessage,
    defaultAccountId: session.accountId ?? null,
  })

  const llmSettings = getLLMSettings(settings)
  if (llmSettings.providers.length === 0) {
    throw new Error("Wizard turn: no LLM providers configured for this user")
  }

  const llmResponse = await requestLLM(llmSettings, {
    prompt,
    schema: getWizardReplySchema(),
  })
  if (llmResponse.error) {
    throw new Error(`Wizard turn: LLM error — ${llmResponse.error}`)
  }

  const parsed = parseWizardReply(llmResponse.output)

  const ruleConflictNotes = detectRuleConflicts(parsed.candidateUpdates, candidates)

  // Apply candidate updates to working set, recompute confidence overall.
  applyCandidateUpdates(candidates, parsed.candidateUpdates, ruleConflictNotes)

  // Apply bulk actions in-process so the persisted session reflects them too.
  for (const action of parsed.bulkActions) {
    applyBulkAction(candidates, action)
  }

  for (const link of parsed.proposedTransferLinks ?? []) {
    const a = candidates.find((c) => c.rowIndex === link.rowIndexA)
    if (!a) continue
    a.extra = { ...(a.extra ?? {}), proposedTransferLink: link }
    if (link.rowIndexB !== null) {
      const b = candidates.find((c) => c.rowIndex === link.rowIndexB)
      if (b) b.extra = { ...(b.extra ?? {}), proposedTransferLink: link }
    }
  }

  await updateImportSession(input.sessionId, input.userId, {
    data: candidates,
    promptVersion,
  })

  // Snapshot business context the first time we use it, so prompts are auditable.
  if (!session.businessContextSnapshot && businessFacts.length > 0) {
    await setBusinessContextSnapshot(input.sessionId, input.userId, {
      facts: businessFacts.map((f) => ({ key: f.key, value: f.value })),
      entityType: user.entityType ?? null,
      capturedAt: new Date().toISOString(),
    })
  }

  // Persist business facts the model surfaced.
  for (const fact of parsed.businessFactsToSave) {
    await upsertBusinessFact({
      userId: input.userId,
      key: fact.key,
      value: { ...fact.value, confidence: fact.confidence ?? fact.value.confidence },
      source: "wizard",
      learnedFromSessionId: input.sessionId,
    })
  }

  // Durable tax tips: upsert as business_facts so the wizard won't re-suggest
  // the same optimization repeatedly. Key is prefixed with "tax_tip:" so these
  // coexist with business profile facts without colliding.
  for (const tip of parsed.taxTips) {
    if (tip.actionable !== "save_as_fact") continue
    const slug = tip.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64)
    if (!slug) continue
    await upsertBusinessFact({
      userId: input.userId,
      key: `tax_tip:${slug}`,
      value: {
        text: `${tip.title} — ${tip.body} [${tip.legalBasis}]`,
      },
      source: "wizard",
      learnedFromSessionId: input.sessionId,
    })
  }

  // Persist analysis records for each candidate update (and one row-less record
  // when there are clarifying questions but no updates, so the audit trail
  // still captures the turn).
  if (parsed.candidateUpdates.length === 0 && parsed.clarifyingQuestions.length > 0) {
    await recordAnalysis({
      userId: input.userId,
      sessionId: input.sessionId,
      rowIndex: null,
      provider: llmResponse.provider,
      model: null,
      promptVersion,
      reasoning: null,
      categoryCode: null,
      projectCode: null,
      suggestedStatus: null,
      confidence: { category: 0, type: 0, status: 0, overall: 0 },
      clarifyingQuestion: parsed.clarifyingQuestions[0] ?? null,
      tokensUsed: llmResponse.tokensUsed ?? null,
    })
  }

  for (const update of parsed.candidateUpdates) {
    const conf = update.confidence ?? { category: 0.7, type: 0.7, status: 0.7, overall: 0.7 }
    await recordAnalysis({
      userId: input.userId,
      sessionId: input.sessionId,
      rowIndex: update.rowIndex,
      provider: llmResponse.provider,
      model: null,
      promptVersion,
      reasoning: update.reasoning ?? null,
      categoryCode: update.categoryCode ?? null,
      projectCode: update.projectCode ?? null,
      suggestedStatus: update.status ?? null,
      confidence: conf,
      clarifyingQuestion: null,
      tokensUsed: llmResponse.tokensUsed ?? null,
    })
  }

  return { reply: parsed, ruleConflictNotes, promptVersion }
}

/**
 * Generate the very first assistant message for a brand-new session. If the
 * user has zero business_facts this opens with onboarding questions; otherwise
 * it greets them and asks what they'd like to do.
 */
export async function runOnboardingTurn(opts: {
  userId: string
  entityType: EntityType | null
  businessName: string | null
  hasFile: boolean
}): Promise<WizardMessage> {
  const factsExist = await hasAnyBusinessFacts(opts.userId)

  let content: string
  if (!factsExist) {
    const intro = opts.businessName
      ? `Hi! I'll help you keep ${opts.businessName}'s books in order.`
      : "Hi! I'll help you keep your books in order."
    const entityLine = opts.entityType
      ? opts.entityType === "autonomo"
        ? "I see you're set up as an autónomo in the Canary Islands (IGIC regime)."
        : opts.entityType === "sl"
          ? "I see you're set up as an SL (Sociedad Limitada)."
          : "I see this is an individual tax profile — I'll focus on Modelo 100 (employment, rental, gains, deductions)."
      : "I don't yet know whether you're an autónomo, an SL, or filing as an individual — could you tell me?"

    const next = opts.hasFile
      ? "Before we look at the file you uploaded, a couple of quick questions so I categorize things correctly:"
      : "Before we add transactions, a couple of quick questions so I categorize things correctly:"

    content = `${intro} ${entityLine} ${next}\n\n1. What line of work are you in?\n2. Do any of your bank/card accounts mix personal and business spending?`
  } else if (opts.hasFile) {
    content =
      "I've parsed the file. I'll flag anything that needs your eye and propose categories — just answer in normal language and I'll handle the rest."
  } else {
    content =
      "What transaction would you like to add? You can paste a receipt, describe it, or fill the fields on the right — I'll help fill in categories and flag anything unusual."
  }

  return {
    id: randomUUID(),
    role: "assistant",
    content,
    createdAt: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function makeUserMessage(content: string): WizardMessage {
  return {
    id: randomUUID(),
    role: "user",
    content,
    createdAt: new Date().toISOString(),
  }
}

export function makeAssistantMessage(reply: WizardAssistantReply): WizardMessage {
  return {
    id: randomUUID(),
    role: "assistant",
    content: reply.assistantMessage,
    createdAt: new Date().toISOString(),
    candidateUpdates: reply.candidateUpdates.length > 0 ? reply.candidateUpdates : undefined,
    bulkActions: reply.bulkActions.length > 0 ? reply.bulkActions : undefined,
    clarifyingQuestions:
      reply.clarifyingQuestions.length > 0 ? reply.clarifyingQuestions : undefined,
    taxTips: reply.taxTips.length > 0 ? reply.taxTips : undefined,
  }
}

export function makeFailureMessage(errorText: string): WizardMessage {
  return {
    id: randomUUID(),
    role: "assistant",
    content:
      "I hit a snag reading the model's reply. You can retry the last message, or rephrase it.",
    createdAt: new Date().toISOString(),
    status: "failed",
    error: errorText,
  }
}

function readSessionCandidates(session: ImportSession): TransactionCandidate[] {
  if (!Array.isArray(session.data)) return []
  return session.data as TransactionCandidate[]
}

function readSessionMessages(session: ImportSession): WizardMessage[] {
  if (!Array.isArray(session.messages)) return []
  return session.messages as WizardMessage[]
}

function parseWizardReply(raw: unknown): WizardAssistantReply {
  const result = wizardAssistantReplySchema.safeParse(raw)
  if (result.success) return result.data

  // Tolerant fallback: if the LLM gave us at least an assistantMessage string,
  // surface that and drop unparsable structured fields rather than failing the
  // whole turn.
  if (raw && typeof raw === "object" && "assistantMessage" in raw && typeof (raw as { assistantMessage: unknown }).assistantMessage === "string") {
    return {
      assistantMessage: (raw as { assistantMessage: string }).assistantMessage,
      candidateUpdates: [],
      bulkActions: [],
      clarifyingQuestions: [],
      taxTips: [],
      businessFactsToSave: [],
      proposedTransferLinks: [],
    }
  }

  throw new Error(`Wizard turn: malformed reply — ${result.error.message.slice(0, 300)}`)
}

function detectRuleConflicts(updates: CandidateUpdate[], candidates: TransactionCandidate[]): string[] {
  const byIndex = new Map(candidates.map((c) => [c.rowIndex, c]))
  const notes: string[] = []
  for (const update of updates) {
    const target = byIndex.get(update.rowIndex)
    if (!target?.ruleMatched) continue
    const wouldChangeCategory =
      update.categoryCode !== undefined && update.categoryCode !== null && update.categoryCode !== target.categoryCode
    const wouldChangeStatus =
      update.status !== undefined && update.status !== null && update.status !== target.status
    if (wouldChangeCategory || wouldChangeStatus) {
      notes.push(
        `Row ${update.rowIndex} is governed by an existing rule — manual change skipped (${target.merchant ?? target.name ?? "row"}).`,
      )
    }
  }
  return notes
}

function applyCandidateUpdates(
  candidates: TransactionCandidate[],
  updates: CandidateUpdate[],
  ruleConflictNotes: string[],
): void {
  const conflictRows = new Set<number>()
  for (const note of ruleConflictNotes) {
    const m = note.match(/Row (\d+)/)
    if (m) conflictRows.add(Number(m[1]))
  }

  const byIndex = new Map(candidates.map((c) => [c.rowIndex, c]))
  for (const update of updates) {
    if (conflictRows.has(update.rowIndex)) continue
    const target = byIndex.get(update.rowIndex)
    if (!target) continue

    if (update.name !== undefined) target.name = update.name ?? target.name
    if (update.merchant !== undefined) target.merchant = update.merchant ?? target.merchant
    if (update.description !== undefined) target.description = update.description ?? target.description
    if (update.total !== undefined) target.total = update.total ?? target.total
    if (update.currencyCode !== undefined) target.currencyCode = update.currencyCode ?? target.currencyCode
    if (update.type !== undefined && update.type !== null) target.type = update.type
    if (update.categoryCode !== undefined) target.categoryCode = update.categoryCode ?? target.categoryCode
    if (update.projectCode !== undefined) target.projectCode = update.projectCode ?? target.projectCode
    if (update.accountId !== undefined) target.accountId = update.accountId ?? target.accountId
    if (update.issuedAt !== undefined) target.issuedAt = update.issuedAt ?? target.issuedAt
    if (update.status !== undefined && update.status !== null) target.status = update.status

    if (update.extra !== undefined) {
      mergeCandidateExtra(target, update.extra)
    }

    if (update.confidence) {
      target.confidence = update.confidence
    } else {
      target.confidence = recomputeConfidence(target)
    }
  }
}

/**
 * Merge a CandidateUpdate's `extra` passthrough into the target candidate,
 * then recompute `realizedGainCents` on the crypto sub-field when enough data
 * is present. Phase 1 computes the gain as
 *   (pricePerUnit - costBasisPerUnit) * quantity
 * in EUR cents. Later phases will replace costBasisPerUnit with a FIFO value.
 */
function mergeCandidateExtra(
  target: TransactionCandidate,
  updateExtra: Record<string, unknown>,
): void {
  const currentExtra = (target.extra ?? {}) as Record<string, unknown>
  const merged: Record<string, unknown> = { ...currentExtra, ...updateExtra }

  const cryptoIn = updateExtra["crypto"] as Record<string, unknown> | undefined
  if (cryptoIn && typeof cryptoIn === "object") {
    const prevCrypto = (currentExtra["crypto"] ?? {}) as Record<string, unknown>
    const nextCrypto: Record<string, unknown> = { ...prevCrypto, ...cryptoIn }
    nextCrypto["realizedGainCents"] = computeRealizedGainCents(nextCrypto)
    merged["crypto"] = nextCrypto
  }

  target.extra = merged as NonNullable<TransactionCandidate["extra"]>
}

function computeRealizedGainCents(crypto: Record<string, unknown>): number | null {
  const price = crypto["pricePerUnit"]
  const cost = crypto["costBasisPerUnit"]
  const qtyRaw = crypto["quantity"]
  if (typeof price !== "number" || typeof cost !== "number") return null
  if (typeof qtyRaw !== "string" && typeof qtyRaw !== "number") return null
  const qty = typeof qtyRaw === "string" ? Number(qtyRaw) : qtyRaw
  if (!Number.isFinite(qty) || qty === 0) return null
  return Math.round((price - cost) * qty)
}

function recomputeConfidence(c: TransactionCandidate): TransactionCandidate["confidence"] {
  const cat = c.categoryCode ? Math.max(c.confidence.category, 0.8) : 0
  const type = c.type ? Math.max(c.confidence.type, 0.8) : 0
  const status = c.status !== "needs_review" ? Math.max(c.confidence.status, 0.8) : 0
  const overall = Math.round(((cat + type + status) / 3) * 100) / 100
  return { category: cat, type, status, overall }
}

function applyBulkAction(candidates: TransactionCandidate[], action: BulkAction): void {
  const targetSet = new Set(action.affectedRowIndexes)
  for (const c of candidates) {
    if (targetSet.size > 0) {
      if (!targetSet.has(c.rowIndex)) continue
    } else if (!matchesBulkAction(c, action)) {
      continue
    }
    if (c.ruleMatched) continue
    if (action.apply.categoryCode !== undefined && action.apply.categoryCode !== null) c.categoryCode = action.apply.categoryCode
    if (action.apply.projectCode !== undefined && action.apply.projectCode !== null) c.projectCode = action.apply.projectCode
    if (action.apply.type !== undefined && action.apply.type !== null) c.type = action.apply.type
    if (action.apply.status !== undefined && action.apply.status !== null) c.status = action.apply.status
    c.confidence = recomputeConfidence(c)
  }
}

function matchesBulkAction(c: TransactionCandidate, action: BulkAction): boolean {
  const fieldValue =
    action.match.field === "merchant"
      ? c.merchant
      : action.match.field === "description"
        ? c.description
        : c.name
  if (!fieldValue) return false
  const haystack = fieldValue.toLowerCase()
  const needle = action.match.value.toLowerCase()
  switch (action.match.type) {
    case "exact":
      return haystack === needle
    case "starts_with":
      return haystack.startsWith(needle)
    case "regex":
      try {
        return new RegExp(action.match.value, "i").test(fieldValue)
      } catch {
        return false
      }
    case "contains":
    default:
      return haystack.includes(needle)
  }
}

// ---------------------------------------------------------------------------
// Re-exports for tests
// ---------------------------------------------------------------------------

export { applyCandidateUpdates, applyBulkAction, detectRuleConflicts, parseWizardReply, WIZARD_PROMPT_VERSION }
export type { LLMResponse }
