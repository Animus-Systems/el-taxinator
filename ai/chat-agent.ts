import { requestLLM } from "@/ai/providers/llmProvider"
import type { LLMSettings } from "@/ai/providers/llmProvider"
import {
  createChatMessage,
  listChatMessages,
  countActiveChatMessages,
  loadOldestChatMessages,
  upsertChatSummary,
  deleteOldestChatMessages,
  getChatSummary,
} from "@/models/chat"
import { upsertBusinessFact, listBusinessFacts } from "@/models/business-facts"
import { getCategories } from "@/models/categories"
import { getProjects } from "@/models/projects"
import { getActiveRules } from "@/models/rules"
import { getTransactionById, findSimilarByMerchant } from "@/models/transactions"
import { getDashboardStats } from "@/models/stats"
import { getUserById } from "@/models/users"
import { getSettings, getLLMSettings } from "@/models/settings"
import {
  chatMessageMetadataSchema,
  proposedRuleSchema,
  proposedUpdateSchema,
  proposedActionSchema,
  type ChatMessage,
  type ChatMessageMetadata,
  type ExtractedFact,
  type ProposedAction,
} from "@/lib/db-types"

const RAW_MESSAGE_CAP = 100

const turnReplySchema = {
  type: "object",
  properties: {
    reply: { type: "string" },
    proposedAction: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          properties: {
            kind: {
              type: "string",
              enum: [
                "createRule",
                "updateTransaction",
                "applyRuleToExisting",
                "bulkUpdate",
                "createCategory",
                "createProject",
                "deleteTransaction",
                "deleteRule",
              ],
            },
          },
          required: ["kind"],
          additionalProperties: true,
        },
      ],
    },
    // Legacy fields retained for gradual LLM migration.
    proposedRule: { anyOf: [{ type: "null" }, { type: "object" }] },
    proposedUpdate: { anyOf: [{ type: "null" }, { type: "object" }] },
    extractedFacts: {
      anyOf: [
        { type: "null" },
        { type: "array", items: { type: "object" } },
      ],
    },
  },
  required: ["reply"],
}

const summarySchema = {
  type: "object",
  properties: { summary: { type: "string" } },
  required: ["summary"],
}

export interface ProcessChatTurnOptions {
  userId: string
  content: string
  contextTransactionId?: string
}

export interface ProcessChatTurnResult {
  userMessage: ChatMessage
  assistantMessage: ChatMessage
}

async function loadLLMSettingsFor(userId: string): Promise<LLMSettings> {
  const settings = await getSettings(userId)
  return getLLMSettings(settings)
}

export async function processChatTurn(
  opts: ProcessChatTurnOptions,
): Promise<ProcessChatTurnResult> {
  const userMeta: ChatMessageMetadata | null = opts.contextTransactionId
    ? { contextTransactionId: opts.contextTransactionId }
    : null
  const userMessage = await createChatMessage(
    opts.userId,
    "user",
    opts.content,
    userMeta,
    "sent",
  )

  const llmSettings = await loadLLMSettingsFor(opts.userId)
  const prompt = await buildTurnPrompt(opts)
  const response = await requestLLM(llmSettings, { prompt, schema: turnReplySchema })

  if (response.error || typeof response.output !== "object" || response.output === null) {
    const errMsg = response.error ?? "Unknown error"
    const assistantMessage = await createChatMessage(
      opts.userId,
      "assistant",
      errMsg,
      { errorMessage: errMsg },
      "error",
    )
    return { userMessage, assistantMessage }
  }

  const out = response.output as Record<string, unknown>
  const reply = typeof out["reply"] === "string" ? (out["reply"] as string) : ""

  let proposedAction: ProposedAction | undefined
  const rawAction = out["proposedAction"]
  if (rawAction && typeof rawAction === "object") {
    const parsed = proposedActionSchema.safeParse(rawAction)
    if (parsed.success) proposedAction = parsed.data
    else console.warn("[chat] dropping invalid proposedAction", parsed.error.issues, "raw:", JSON.stringify(rawAction))
  }

  // Legacy migration: if no new-shape action came back, try to synthesize one
  // from the old fields so older LLM outputs still produce proposals.
  if (!proposedAction) {
    const rawRule = out["proposedRule"]
    if (rawRule && typeof rawRule === "object") {
      const parsed = proposedRuleSchema.safeParse(rawRule)
      if (parsed.success) {
        proposedAction = {
          kind: "createRule",
          name: parsed.data.name,
          matchType: parsed.data.matchType,
          matchField: parsed.data.matchField,
          matchValue: parsed.data.matchValue,
          ...(parsed.data.categoryCode !== undefined ? { categoryCode: parsed.data.categoryCode } : {}),
          ...(parsed.data.projectCode !== undefined ? { projectCode: parsed.data.projectCode } : {}),
          ...(parsed.data.type !== undefined ? { type: parsed.data.type } : {}),
          ...(parsed.data.priority !== undefined ? { priority: parsed.data.priority } : {}),
          reason: parsed.data.reason,
        }
      }
    }
  }
  if (!proposedAction) {
    const rawUpdate = out["proposedUpdate"]
    if (rawUpdate && typeof rawUpdate === "object") {
      const parsed = proposedUpdateSchema.safeParse(rawUpdate)
      if (parsed.success) {
        proposedAction = {
          kind: "updateTransaction",
          transactionId: parsed.data.transactionId,
          patch: parsed.data.patch,
          reason: parsed.data.reason,
        }
      }
    }
  }

  const extractedFacts = extractFacts(out["extractedFacts"])
  for (const fact of extractedFacts) {
    try {
      await upsertBusinessFact({
        userId: opts.userId,
        key: fact.key,
        value: coerceFactValue(fact.value),
        source: "user",
      })
    } catch (err) {
      console.warn("[chat] failed to upsert business fact", fact.key, err)
    }
  }

  const meta: ChatMessageMetadata = {}
  if (proposedAction) meta.proposedAction = proposedAction
  if (extractedFacts.length > 0) meta.extractedFacts = extractedFacts

  const metaValidated = chatMessageMetadataSchema.safeParse(meta)
  const finalMeta = metaValidated.success ? metaValidated.data : null
  const hasMeta = finalMeta && Object.keys(finalMeta).length > 0

  const assistantMessage = await createChatMessage(
    opts.userId,
    "assistant",
    reply,
    hasMeta ? finalMeta : null,
    "sent",
  )

  compactChatHistory(opts.userId).catch((err) => {
    console.warn("[chat] compaction failed", err)
  })

  return { userMessage, assistantMessage }
}

export async function compactChatHistory(userId: string): Promise<void> {
  const count = await countActiveChatMessages(userId)
  if (count <= RAW_MESSAGE_CAP) return

  const overflow = count - RAW_MESSAGE_CAP
  const oldest = await loadOldestChatMessages(userId, overflow)
  if (oldest.length === 0) return

  const priorSummary = await getChatSummary(userId)
  const llmSettings = await loadLLMSettingsFor(userId)

  const parts: string[] = []
  if (priorSummary) {
    parts.push("[Prior summary]", priorSummary.content, "")
  }
  parts.push("[Messages to summarize]")
  for (const m of oldest) {
    parts.push(`${m.role.toUpperCase()}: ${m.content}`)
  }
  parts.push(
    "",
    "Produce a concise summary in under 500 words that preserves:",
    "- User preferences and agreed-upon patterns",
    "- Unresolved questions",
    "- Key topics discussed",
    "Do not invent information.",
  )
  const prompt = parts.join("\n")

  const response = await requestLLM(llmSettings, { prompt, schema: summarySchema })
  if (response.error) {
    console.warn("[chat] summarization failed", response.error)
    return
  }
  const outObj = response.output as Record<string, unknown> | null
  const summary = outObj && typeof outObj["summary"] === "string" ? (outObj["summary"] as string) : ""
  if (!summary) {
    console.warn("[chat] summarization returned empty summary")
    return
  }

  const priorCount = priorSummary?.metadata?.summaryOfCount ?? 0
  await upsertChatSummary(userId, summary, priorCount + oldest.length)
  await deleteOldestChatMessages(userId, oldest.length)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function buildTurnPrompt(opts: ProcessChatTurnOptions): Promise<string> {
  const [user, facts, categories, projects, rules, history, summary] = await Promise.all([
    getUserById(opts.userId),
    listBusinessFacts(opts.userId),
    getCategories(opts.userId),
    getProjects(opts.userId),
    getActiveRules(opts.userId),
    listChatMessages(opts.userId),
    getChatSummary(opts.userId),
  ])

  const now = new Date()
  const ytdStart = `${now.getUTCFullYear()}-01-01`
  const quarter = Math.floor(now.getUTCMonth() / 3)
  const quarterStartMonth = quarter * 3 + 1
  const qStart = `${now.getUTCFullYear()}-${String(quarterStartMonth).padStart(2, "0")}-01`
  const today = now.toISOString().slice(0, 10)

  const [ytd, qtd] = await Promise.all([
    getDashboardStats(opts.userId, { dateFrom: ytdStart, dateTo: today }).catch(() => null),
    getDashboardStats(opts.userId, { dateFrom: qStart, dateTo: today }).catch(() => null),
  ])

  const parts: string[] = []
  parts.push(
    "You are an AI assistant helping a small-business owner manage transactions and tax categorization.",
    "Reply briefly and clearly. When the user describes a recurring pattern you can propose a rule (field + matcher + category).",
    "When the user is looking at a specific transaction and wants a change, you can propose an update.",
    "Only propose ONE of rule OR update per turn (never both).",
    "If the user shares a durable preference, include it in extractedFacts as { key, value: { text, confidence? } }.",
    "",
  )
  if (user?.entityType) parts.push(`[Entity type] ${user.entityType}`, "")
  if (facts.length > 0) {
    parts.push("[Business facts]")
    for (const f of facts) {
      parts.push(`- ${f.key}: ${JSON.stringify(f.value)}`)
    }
    parts.push("")
  }
  if (categories.length > 0) {
    parts.push("[Categories]")
    for (const c of categories) parts.push(`- ${c.code}: ${stringifyName(c.name)}`)
    parts.push("")
  }
  if (projects.length > 0) {
    parts.push("[Projects]")
    for (const p of projects) parts.push(`- ${p.code}: ${stringifyName(p.name)}`)
    parts.push("")
  }
  if (rules.length > 0) {
    parts.push("[Active rules]")
    for (const r of rules) {
      parts.push(`- ${r.matchField} ${r.matchType} "${r.matchValue}" → category=${r.categoryCode ?? "-"}`)
    }
    parts.push("")
  }
  if (opts.contextTransactionId) {
    const tx = await getTransactionById(opts.contextTransactionId, opts.userId)
    if (tx) {
      parts.push("[Current transaction]")
      parts.push(JSON.stringify({
        id: tx.id,
        name: tx.name,
        merchant: tx.merchant,
        description: tx.description,
        total: tx.total,
        currencyCode: tx.currencyCode,
        categoryCode: tx.categoryCode,
        projectCode: tx.projectCode,
        type: tx.type,
        issuedAt: tx.issuedAt,
      }))
      parts.push("")
      if (tx.merchant) {
        const similar = await findSimilarByMerchant(opts.userId, tx.merchant, 5, tx.id)
        if (similar.length > 0) {
          parts.push("[Recent transactions with same merchant]")
          for (const s of similar) {
            parts.push(`- ${s.issuedAt ?? ""} ${s.merchant ?? ""} total=${s.total ?? ""} category=${s.categoryCode ?? "-"}`)
          }
          parts.push("")
        }
      }
    }
  }
  if (summary) {
    parts.push("[Prior conversation summary]", summary.content, "")
  }
  const pastMessages = history.filter((m) => m.role !== "system")
  if (pastMessages.length > 0) {
    parts.push("[Conversation so far]")
    for (const m of pastMessages) parts.push(`${m.role.toUpperCase()}: ${m.content}`)
    parts.push("")
  }
  const hasAnyStats = (s: { totalIncomePerCurrency?: Record<string, number>; totalExpensesPerCurrency?: Record<string, number> } | null): boolean => {
    if (!s) return false
    const anyIncome = Object.keys(s.totalIncomePerCurrency ?? {}).length > 0
    const anyExpense = Object.keys(s.totalExpensesPerCurrency ?? {}).length > 0
    return anyIncome || anyExpense
  }
  const summarizeCur = (label: string, map: Record<string, number> | undefined): string => {
    if (!map || Object.keys(map).length === 0) return `${label}: 0`
    const entries = Object.entries(map).map(([c, v]) => `${c} ${(v / 100).toFixed(2)}`)
    return `${label}: ${entries.join(", ")}`
  }
  if (hasAnyStats(ytd) || hasAnyStats(qtd)) {
    parts.push("[Recent activity]")
    if (ytd) {
      parts.push(`YTD income — ${summarizeCur("income", ytd.totalIncomePerCurrency)}`)
      parts.push(`YTD expenses — ${summarizeCur("expenses", ytd.totalExpensesPerCurrency)}`)
    }
    if (qtd) {
      parts.push(`Quarter income — ${summarizeCur("income", qtd.totalIncomePerCurrency)}`)
      parts.push(`Quarter expenses — ${summarizeCur("expenses", qtd.totalExpensesPerCurrency)}`)
    }
    parts.push("")
  }
  parts.push(
    "[Available actions]",
    "Emit at most ONE action per turn under the `proposedAction` field. Each action has the exact JSON shape shown. Use the matching 'kind' value. Omit `proposedAction` entirely when you're just chatting.",
    "",
    "createRule:",
    '  { "kind": "createRule", "name": "AWS bills", "matchType": "contains", "matchField": "merchant", "matchValue": "AWS", "categoryCode": "software", "projectCode": null, "type": null, "reason": "why" }',
    "",
    "updateTransaction (current transaction only):",
    '  { "kind": "updateTransaction", "transactionId": "<uuid from [Current transaction]>", "patch": { "categoryCode": "software", "note": "…" }, "reason": "why" }',
    "",
    "applyRuleToExisting (match & update past transactions; set alsoCreate=true to persist the rule too):",
    '  { "kind": "applyRuleToExisting", "ruleSpec": { "name": "AWS bills", "matchType": "contains", "matchField": "merchant", "matchValue": "AWS", "categoryCode": "software", "projectCode": null, "type": null }, "alsoCreate": true, "reason": "why" }',
    "",
    "bulkUpdate (filter+patch past transactions; user will confirm):",
    '  { "kind": "bulkUpdate", "filter": { "merchant": "AWS" }, "patch": { "categoryCode": "software" }, "reason": "why" }',
    "  filter keys: search, merchant, categoryCode, projectCode, type, dateFrom, dateTo, accountId",
    "  patch keys: categoryCode, projectCode, type, note",
    "",
    "createCategory / createProject:",
    '  { "kind": "createCategory", "name": "Research", "color": "#5577aa", "llmPrompt": "…", "reason": "why" }',
    '  { "kind": "createProject", "name": "Acme", "color": "#5577aa", "reason": "why" }',
    "",
    "deleteTransaction / deleteRule (destructive, user will confirm):",
    '  { "kind": "deleteTransaction", "transactionId": "<uuid>", "reason": "why" }',
    '  { "kind": "deleteRule", "ruleId": "<uuid>", "reason": "why" }',
    "",
    "Field rules:",
    "- Every action requires `reason` (string, ≤500 chars).",
    "- matchType ∈ contains | starts_with | exact | regex",
    "- matchField ∈ name | merchant | description",
    "- type (on rules/transactions) ∈ income | expense | other",
    "- If a field is unknown, prefer null (for nullable fields) or omit it (for optional ones). Never invent IDs.",
    "",
  )
  parts.push("[User message]", opts.content)
  return parts.join("\n")
}

function stringifyName(name: unknown): string {
  if (typeof name === "string") return name
  if (name && typeof name === "object") {
    const n = name as Record<string, unknown>
    if (typeof n["en"] === "string") return n["en"] as string
    if (typeof n["es"] === "string") return n["es"] as string
  }
  return ""
}

function extractFacts(raw: unknown): ExtractedFact[] {
  if (!Array.isArray(raw)) return []
  const out: ExtractedFact[] = []
  for (const item of raw) {
    if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>
      if (typeof obj["key"] === "string") {
        out.push({ key: obj["key"] as string, value: obj["value"] })
      }
    }
  }
  return out
}

function coerceFactValue(value: unknown): { text: string; confidence?: number; examples?: string[] } {
  if (value && typeof value === "object" && "text" in (value as Record<string, unknown>)) {
    const v = value as { text: unknown; confidence?: unknown; examples?: unknown }
    return {
      text: typeof v.text === "string" ? v.text : JSON.stringify(v.text),
      ...(typeof v.confidence === "number" ? { confidence: v.confidence } : {}),
      ...(Array.isArray(v.examples) ? { examples: (v.examples as unknown[]).filter((x): x is string => typeof x === "string") } : {}),
    }
  }
  if (typeof value === "string") return { text: value }
  return { text: JSON.stringify(value) }
}
