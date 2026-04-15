import type {
  BankAccount,
  BusinessFact,
  Category,
  CategorizationRule,
  EntityType,
  KnowledgePack,
  Project,
  WizardMessage,
} from "@/lib/db-types"
import type { TransactionCandidate } from "./import-csv"

export const WIZARD_PROMPT_VERSION = "2026-04-15.1"

const MAX_FOCUSED_CANDIDATES = 50

export type WizardPromptInput = {
  entityType: EntityType | null
  businessName: string | null
  locale: string
  businessFacts: BusinessFact[]
  categories: Category[]
  projects: Project[]
  accounts: BankAccount[]
  rules: CategorizationRule[]
  knowledgePacks: KnowledgePack[]
  candidates: TransactionCandidate[]
  focusRowIndexes: number[] | null
  messages: WizardMessage[]
  userMessage: string
  defaultAccountId: string | null
}

const REPLY_SCHEMA = {
  type: "object",
  properties: {
    assistantMessage: { type: "string" },
    candidateUpdates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          rowIndex: { type: "number" },
          name: { type: ["string", "null"] },
          merchant: { type: ["string", "null"] },
          description: { type: ["string", "null"] },
          total: { type: ["number", "null"] },
          currencyCode: { type: ["string", "null"] },
          type: { type: ["string", "null"], enum: ["expense", "income", null] },
          categoryCode: { type: ["string", "null"] },
          projectCode: { type: ["string", "null"] },
          accountId: { type: ["string", "null"] },
          issuedAt: { type: ["string", "null"] },
          status: {
            type: ["string", "null"],
            enum: ["needs_review", "business", "business_non_deductible", "personal_ignored", null],
          },
          reasoning: { type: "string" },
          confidence: {
            type: "object",
            properties: {
              category: { type: "number" },
              type: { type: "number" },
              status: { type: "number" },
              overall: { type: "number" },
            },
            required: ["category", "type", "status", "overall"],
          },
        },
        required: ["rowIndex"],
      },
    },
    bulkActions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          match: {
            type: "object",
            properties: {
              field: { type: "string", enum: ["name", "merchant", "description"] },
              type: { type: "string", enum: ["contains", "exact", "regex", "starts_with"] },
              value: { type: "string" },
            },
            required: ["field", "type", "value"],
          },
          apply: {
            type: "object",
            properties: {
              categoryCode: { type: ["string", "null"] },
              projectCode: { type: ["string", "null"] },
              type: { type: ["string", "null"], enum: ["expense", "income", null] },
              status: { type: ["string", "null"] },
            },
          },
          affectedRowIndexes: { type: "array", items: { type: "number" } },
          offerAsRule: { type: "boolean" },
        },
        required: ["description", "match", "apply"],
      },
    },
    clarifyingQuestions: {
      type: "array",
      items: { type: "string" },
      maxItems: 3,
    },
    taxTips: {
      type: "array",
      items: {
        type: "object",
        properties: {
          rowIndex: { type: ["number", "null"] },
          title: { type: "string" },
          body: { type: "string" },
          legalBasis: { type: "string" },
          actionable: {
            type: "string",
            enum: ["save_as_fact", "propose_recategorization", "advisory"],
          },
        },
        required: ["rowIndex", "title", "body", "legalBasis"],
      },
    },
    businessFactsToSave: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          value: {
            type: "object",
            properties: {
              text: { type: "string" },
              confidence: { type: "number" },
              examples: { type: "array", items: { type: "string" } },
            },
            required: ["text"],
          },
          confidence: { type: "number" },
        },
        required: ["key", "value"],
      },
    },
  },
  required: ["assistantMessage"],
}

export function getWizardReplySchema(): Record<string, unknown> {
  return REPLY_SCHEMA
}

function i18nToString(value: unknown): string {
  if (typeof value === "string") return value
  if (value && typeof value === "object" && "en" in value) {
    return String((value as { en: string }).en ?? "")
  }
  if (value && typeof value === "object") {
    const first = Object.values(value as Record<string, unknown>)[0]
    return typeof first === "string" ? first : ""
  }
  return ""
}

function formatBusinessFacts(facts: BusinessFact[]): string {
  if (facts.length === 0) return "(no facts learned yet — onboarding pending)"
  return facts
    .map((f) => {
      const conf = f.value.confidence !== undefined ? ` [conf=${f.value.confidence.toFixed(2)}]` : ""
      return `- ${f.key}: ${f.value.text}${conf}`
    })
    .join("\n")
}

function formatCategories(categories: Category[]): string {
  if (categories.length === 0) return "(no categories defined)"
  return categories
    .map((c) => {
      const tax = c.taxFormRef ? ` [tax-form: ${c.taxFormRef}]` : ""
      const hint = c.llmPrompt ? ` — ${i18nToString(c.llmPrompt)}` : ""
      return `- code="${c.code}" name="${i18nToString(c.name)}"${tax}${hint}`
    })
    .join("\n")
}

// Rough character budget per pack (~4 KB → ~1000 tokens) so a two-pack
// payload stays under ~8 KB of prompt, leaving headroom for candidates +
// conversation history.
const PACK_CHAR_BUDGET = 4000

function pickRelevantPacks(packs: KnowledgePack[], entityType: EntityType | null): KnowledgePack[] {
  if (packs.length === 0) return []
  const want = entityType === "autonomo" ? "canary-autonomo" : entityType === "sl" ? "canary-sl" : null
  const pick = want ? packs.filter((p) => p.slug === want) : []
  // If the entity type doesn't match anything, fall back to the single newest
  // pack so the model has SOME domain grounding rather than none.
  if (pick.length > 0) return pick
  return packs.slice(0, 1)
}

function formatKnowledgePack(pack: KnowledgePack): string {
  let content = pack.content.trim()
  if (content.length > PACK_CHAR_BUDGET) {
    content = content.slice(0, PACK_CHAR_BUDGET) + "\n\n…(truncated for prompt budget)"
  }
  const refreshedAt = pack.lastRefreshedAt
    ? pack.lastRefreshedAt.toISOString().slice(0, 10)
    : "never"
  const provider = pack.provider ? ` by ${pack.provider}` : ""
  return `### ${pack.title} (last verified ${refreshedAt}${provider}, status=${pack.reviewStatus})\n\n${content}`
}

function formatAccounts(accounts: BankAccount[], defaultAccountId: string | null): string {
  if (accounts.length === 0) return "(no bank accounts configured — every candidate defaults to no account)"
  return accounts
    .map((a) => {
      const bank = a.bankName ? ` [bank: ${a.bankName}]` : ""
      const currency = a.currencyCode ? ` [ccy: ${a.currencyCode}]` : ""
      const def = defaultAccountId && a.id === defaultAccountId ? " (session default)" : ""
      return `- id="${a.id}" name="${a.name}"${bank}${currency}${def}`
    })
    .join("\n")
}

function formatProjects(projects: Project[]): string {
  if (projects.length === 0) return "(no projects defined)"
  return projects
    .map((p) => {
      const hint = p.llmPrompt ? ` — ${i18nToString(p.llmPrompt)}` : ""
      return `- code="${p.code}" name="${i18nToString(p.name)}"${hint}`
    })
    .join("\n")
}

function formatRules(rules: CategorizationRule[]): string {
  if (rules.length === 0) return "(no active rules — every classification is fresh)"
  const limited = rules.slice(0, 30)
  const lines = limited.map((r) => {
    const tgt = [
      r.categoryCode ? `cat=${r.categoryCode}` : null,
      r.projectCode ? `proj=${r.projectCode}` : null,
      r.status ? `status=${r.status}` : null,
    ]
      .filter(Boolean)
      .join(", ")
    return `- name="${r.name}" if ${r.matchField} ${r.matchType} "${r.matchValue}" → ${tgt} [conf=${r.confidence}, src=${r.source}]`
  })
  if (rules.length > limited.length) {
    lines.push(`(+${rules.length - limited.length} more rules elided for brevity)`)
  }
  return lines.join("\n")
}

function pickFocusedCandidates(
  candidates: TransactionCandidate[],
  focusRowIndexes: number[] | null,
): { focused: TransactionCandidate[]; elidedCount: number } {
  const focusSet = focusRowIndexes ? new Set(focusRowIndexes) : null
  const eligible = candidates.filter((c) => {
    if (focusSet?.has(c.rowIndex)) return true
    return c.status === "needs_review"
  })
  const focused = eligible.slice(0, MAX_FOCUSED_CANDIDATES)
  const elidedCount = candidates.length - focused.length
  return { focused, elidedCount }
}

function formatCandidate(c: TransactionCandidate): string {
  const parts = [
    `row=${c.rowIndex}`,
    c.issuedAt ? `date=${c.issuedAt}` : null,
    c.merchant ? `merchant="${c.merchant}"` : null,
    c.name && c.name !== c.merchant ? `name="${c.name}"` : null,
    c.description ? `desc="${c.description.slice(0, 80)}"` : null,
    c.total !== null ? `total=${(c.total / 100).toFixed(2)} ${c.currencyCode ?? ""}`.trim() : null,
    c.type ? `type=${c.type}` : null,
    c.categoryCode ? `cat=${c.categoryCode}` : null,
    c.projectCode ? `proj=${c.projectCode}` : null,
    c.accountId ? `account=${c.accountId}` : null,
    `status=${c.status}`,
    c.suggestedStatus && c.suggestedStatus !== c.status ? `suggested=${c.suggestedStatus}` : null,
    c.ruleMatched ? "ruleMatched" : null,
  ].filter(Boolean)
  return `- ${parts.join(" ")}`
}

function formatMessageHistory(messages: WizardMessage[]): string {
  if (messages.length === 0) return "(no prior turns — this is the first message)"
  const recent = messages.slice(-30)
  return recent
    .map((m) => `[${m.role}] ${m.content.replace(/\s+/g, " ").trim()}`)
    .join("\n")
}

function entityTypeLabel(t: EntityType | null): string {
  if (t === "autonomo") return "autónomo (sole proprietor)"
  if (t === "sl") return "Sociedad Limitada (SL, limited company)"
  return "(entity type not yet known)"
}

export function buildWizardPrompt(input: WizardPromptInput): {
  prompt: string
  promptVersion: string
  focusedCount: number
  elidedCount: number
} {
  const { focused, elidedCount } = pickFocusedCandidates(input.candidates, input.focusRowIndexes)

  const businessLine = input.businessName ? ` (${input.businessName})` : ""
  const localeLine =
    input.locale === "es"
      ? "Respond in Spanish (Spain). Use Spanish accountant terminology."
      : "Respond in English."

  const candidatesBlock =
    focused.length === 0
      ? "(no transactions to review right now — this turn is conversational only)"
      : focused.map(formatCandidate).join("\n") +
        (elidedCount > 0 ? `\n+${elidedCount} more rows elided (already classified or out of focus)` : "")

  const prompt = `You are an AI accountant for a Spanish ${entityTypeLabel(input.entityType)}${businessLine}.
Your job is to help classify bank transactions for tax filing in the Canary Islands (IGIC regime).
${localeLine} Be concise, friendly, and directly useful. Ask at most 3 clarifying questions per turn.

## What you know about the business
${formatBusinessFacts(input.businessFacts)}

## Canary Islands tax knowledge
${
  pickRelevantPacks(input.knowledgePacks, input.entityType).length === 0
    ? "(no knowledge packs configured — fall back to general Spanish accountant heuristics, and say so when citing a rule)"
    : pickRelevantPacks(input.knowledgePacks, input.entityType)
        .map(formatKnowledgePack)
        .join("\n\n")
}

## Available categories
${formatCategories(input.categories)}

## Available projects
${formatProjects(input.projects)}

## Available bank accounts
${formatAccounts(input.accounts, input.defaultAccountId)}
When you know which account a transaction belongs to (matched bank, card mentioned in description, or user told you), set accountId on the candidateUpdate using one of the ids above. If the session has a default account the user can leave it as-is.

## Active categorization rules
${formatRules(input.rules)}

## Conversation so far
${formatMessageHistory(input.messages)}

## Current candidate transactions you may update
${candidatesBlock}

## The user's latest message
${input.userMessage}

## Coaching duties (act like a real Spanish accountant)
- Probe for details before classifying any ambiguous row: ask about business purpose, whether a factura exists (Spanish tax-invoice with NIF), who attended (for meals), percentage of business vs personal use (for mixed-use items like phone/car/home office).
- When a transaction is not fully deductible, proactively suggest a lawful alternative that would be (e.g. "a personal meal isn't deductible, but a client lunch with a factura and business purpose is 50% deductible").
- Every tax-saving tip you emit MUST cite its legal basis — Modelo casilla number (e.g. "Modelo 420 casilla 5"), BOE article (e.g. "BOE-A-2019-4244"), or LIRPF/LIS section (e.g. "Art. 30.2.1 LIRPF"). If you are uncertain of the exact citation, either skip the tip or flag the citation with ⚠ and say you're not sure.
- Emit tips via the taxTips array — not in the assistantMessage itself (the UI renders them as distinct callout cards).

## Crypto handling (IMPORTANT)
A transaction looks crypto-related when any of these are true:
- Merchant/sender name matches a known exchange or wallet: Swissborg, Coinbase, Binance, Kraken, Bitstamp, Bit2Me, Bitpanda, Crypto.com, Revolut crypto, Nexo, Ledger, MetaMask.
- The source account's type is crypto_exchange or crypto_wallet.
- Description mentions "withdrawal", "deposit", "trade", "sell", "buy" together with a token symbol (BTC, ETH, SOL, USDC, ...).

Rules:
- A bank deposit FROM a crypto exchange is NOT ordinary income. It is the fiat leg of a disposal. Set status="personal_ignored" (autónomo) or "business_non_deductible" (SL) on the bank row, and create/flag the matching disposal row.
- A disposal (sell of crypto → fiat or crypto → crypto) is a taxable event. Set categoryCode="crypto_disposal". Ask the user for: asset ticker, quantity, and cost basis per unit in EUR. Emit the metadata in extra.crypto — see Output rules below.
- A fiat→crypto transfer is a purchase. Set categoryCode="crypto_purchase" and capture asset + quantity + pricePerUnit in extra.crypto. Purchases are not taxable events; they build cost basis for later FIFO matching.
- Staking rewards, lending interest, and yield-farming payouts go to categoryCode="crypto_staking_reward" (rendimiento del capital mobiliario, Modelo 100).
- Airdrops/forks go to categoryCode="crypto_airdrop" with pricePerUnit = fair market value at receipt.
- When cost basis is unknown, keep status="needs_review" and ask the user to paste it from their exchange records. Never guess.
- Emit a taxTip citing "Art. 14.1.c LIRPF" (FIFO obligation) the first time a crypto disposal is classified in a session. Also surface Modelo 721 awareness if the user mentions foreign-exchange holdings over €50K at year-end.

## Output rules
Produce a single JSON object with these top-level fields:
- assistantMessage (string, REQUIRED): your natural-language reply to the user. Keep it concise and human — the structured fields carry the machine-readable details.
- candidateUpdates (array, default []): one entry per row you are confidently changing. Always include rowIndex and reasoning. Set status, categoryCode, projectCode, type as needed. Set confidence numbers between 0 and 1. For crypto rows (category=crypto_*) set extra.crypto = { asset, quantity (decimal string), pricePerUnit (EUR cents, integer), costBasisPerUnit (EUR cents, integer or null if unknown) }. Omit the extra field entirely when not a crypto row.
- bulkActions (array, default []): when many rows share a pattern the user just clarified, propose ONE bulkAction (preferred over many candidateUpdates). Set offerAsRule=true if it would make sense to persist as a rule.
- clarifyingQuestions (array, max 3): only when you genuinely need more information.
- taxTips (array, default []): per-row or session-wide tips that help the user save tax legally. Each tip REQUIRES rowIndex (number or null for session-wide), title, body, legalBasis (non-empty). Use actionable="save_as_fact" when the tip is durable context the user should remember; "propose_recategorization" when you want the user to change a category; "advisory" otherwise.
- businessFactsToSave (array, default []): durable facts the user just told you about the business. Use stable keys like "profession", "vat_regime", "mixed_use_account:<account_name>", "client:<name>". Each value has at minimum {text}.

If a row already has ruleMatched=true and you would change its category, instead emit a clarifyingQuestion explaining the conflict. Never silently override a manual rule.

For every candidateUpdate include a confidence object with category/type/status/overall in [0,1]. EXTRACTED facts → 0.95+, well-grounded inferences → 0.7–0.9, weak guesses → 0.4–0.6.

Return ONLY the JSON object. No markdown fences, no preamble, no trailing text.`

  return {
    prompt,
    promptVersion: WIZARD_PROMPT_VERSION,
    focusedCount: focused.length,
    elidedCount,
  }
}
