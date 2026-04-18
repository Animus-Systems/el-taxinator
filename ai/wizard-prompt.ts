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
import type { ContextFileText } from "@/lib/context-file-text"
import type { TransactionCandidate } from "./import-csv"

export const WIZARD_PROMPT_VERSION = "2026-04-17.9"

const MAX_FOCUSED_CANDIDATES = 150

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
  contextFiles?: ContextFileText[]
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
          type: { type: ["string", "null"], enum: ["expense", "income", "transfer", "conversion", null] },
          categoryCode: { type: ["string", "null"] },
          projectCode: { type: ["string", "null"] },
          accountId: { type: ["string", "null"] },
          issuedAt: { type: ["string", "null"] },
          status: {
            type: ["string", "null"],
            enum: [
              "needs_review",
              "business",
              "business_non_deductible",
              "personal_taxable",
              "personal_ignored",
              null,
            ],
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
              type: { type: ["string", "null"], enum: ["expense", "income", "transfer", "conversion", null] },
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
    proposedTransferLinks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          rowIndexA: { type: "number" },
          rowIndexB: { type: ["number", "null"] },
          confidence: { type: "number" },
          reason: { type: "string" },
          counterAccountId: { type: ["string", "null"] },
        },
        required: ["rowIndexA", "rowIndexB", "confidence", "reason"],
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
const FILING_PACK_CHAR_BUDGET = 1500

/**
 * Pick the ordered list of knowledge packs to feed the LLM, entity-type
 * pack first, then the always-additive topic packs (personal-tax,
 * property-tax, crypto-tax). Autónomo filers also get personal-tax
 * because they file Modelo 100 alongside business rendimiento.
 *
 * Exported for tests.
 */
export function pickRelevantPacks(packs: KnowledgePack[], entityType: EntityType | null): KnowledgePack[] {
  if (packs.length === 0) return []
  const bySlug = (slug: string): KnowledgePack | undefined => packs.find((p) => p.slug === slug)

  const ordered: Array<KnowledgePack | undefined> = []
  if (entityType === "autonomo") {
    ordered.push(bySlug("canary-autonomo"), bySlug("personal-tax"))
    ordered.push(
      bySlug("filing-modelo-420"),
      bySlug("filing-modelo-130"),
      bySlug("filing-modelo-425"),
      bySlug("filing-modelo-100"),
      bySlug("filing-modelo-721"),
    )
  } else if (entityType === "sl") {
    ordered.push(bySlug("canary-sl"))
    ordered.push(
      bySlug("filing-modelo-420"),
      bySlug("filing-modelo-202"),
      bySlug("filing-modelo-425"),
      bySlug("filing-modelo-100"),
      bySlug("filing-modelo-721"),
    )
  } else if (entityType === "individual") {
    ordered.push(bySlug("personal-tax"), bySlug("filing-modelo-100"))
  }
  ordered.push(bySlug("property-tax"), bySlug("crypto-tax"))

  const result = ordered.filter((p): p is KnowledgePack => p !== undefined)
  // Fall back to the first pack if nothing matched — better than feeding an
  // entity-ignorant prompt with zero domain context.
  if (result.length === 0) {
    const first = packs[0]
    return first ? [first] : []
  }
  return result
}

export function formatKnowledgePack(pack: KnowledgePack): string {
  const budget = pack.slug.startsWith("filing-") ? FILING_PACK_CHAR_BUDGET : PACK_CHAR_BUDGET
  let content = pack.content.trim()
  if (content.length > budget) {
    content = content.slice(0, budget) + "\n\n…(truncated for prompt budget)"
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
      return `- id="${a.id}" name="${a.name}"${bank}${currency} type=${a.accountType}${def}`
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
    return `- name="${i18nToString(r.name)}" if ${r.matchField} ${r.matchType} "${r.matchValue}" → ${tgt} [conf=${r.confidence}, src=${r.source}]`
  })
  if (rules.length > limited.length) {
    lines.push(`(+${rules.length - limited.length} more rules elided for brevity)`)
  }
  return lines.join("\n")
}

// Stopwords excluded from name-hint tokenization. Keep the list short — we
// only want to drop words that would match too broadly (currency codes,
// generic English/Spanish filler). Adding a token here means users cannot
// disambiguate rows by that token alone.
const HINT_STOPWORDS = new Set<string>([
  "from",
  "the",
  "this",
  "that",
  "with",
  "transaction",
  "pln",
  "eur",
  "usd",
  "gbp",
  "chf",
  "transfer",
  "payment",
  "row",
])

/**
 * Pull row indexes out of `candidates` that look like the user is referring
 * to them in `message` (by amount or by merchant/name/description token).
 * These rows are force-included in the prompt window even when they are
 * already classified, so the AI can act on targeted requests like
 * "the 254.25 PLN Ewelina transaction" without the row being elided.
 *
 * Exported for tests.
 */
export function collectHintedRowIndexes(
  candidates: TransactionCandidate[],
  message: string | null | undefined,
): Set<number> {
  const hinted = new Set<number>()
  if (!message) return hinted

  const amountRe = /\b\d{1,7}(?:[.,]\d{1,2})?\b/g
  const amountCentsCandidates = new Set<number>()
  for (const match of message.matchAll(amountRe)) {
    const raw = match[0].replace(",", ".")
    const num = Number(raw)
    if (!Number.isFinite(num)) continue
    if (/[.,]/.test(match[0])) {
      amountCentsCandidates.add(Math.round(num * 100))
    } else if (num >= 10) {
      // bare integer — interpret as units (€254 → 25400 cents) AND as raw
      // cents (254c) so "254" still matches the 254.25 row.
      amountCentsCandidates.add(Math.round(num * 100))
      amountCentsCandidates.add(num)
    }
  }

  const tokenRe = /[A-Za-zÀ-ÿ]{3,}/g
  const nameTokens: string[] = []
  for (const match of message.matchAll(tokenRe)) {
    const tok = match[0].toLowerCase()
    if (HINT_STOPWORDS.has(tok)) continue
    nameTokens.push(tok)
  }

  for (const c of candidates) {
    if (c.total !== null && amountCentsCandidates.has(Math.abs(c.total))) {
      hinted.add(c.rowIndex)
      continue
    }
    if (nameTokens.length === 0) continue
    const haystack = `${c.merchant ?? ""}\n${c.name ?? ""}\n${c.description ?? ""}`.toLowerCase()
    if (nameTokens.some((tok) => haystack.includes(tok))) {
      hinted.add(c.rowIndex)
    }
  }
  return hinted
}

export function pickFocusedCandidates(
  candidates: TransactionCandidate[],
  focusRowIndexes: number[] | null,
  userMessage: string | null | undefined,
): { focused: TransactionCandidate[]; elidedCount: number } {
  const focusSet = focusRowIndexes ? new Set(focusRowIndexes) : null
  const hinted = collectHintedRowIndexes(candidates, userMessage ?? null)

  const eligible = candidates.filter((c) => {
    if (focusSet?.has(c.rowIndex)) return true
    if (hinted.has(c.rowIndex)) return true
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

/**
 * Render any context files the user has attached to the session into a prompt
 * block. Each file's text is already capped at `PER_FILE_CHAR_CAP` upstream in
 * `lib/context-file-text.ts`. Intentionally terse framing so the LLM clearly
 * understands these are cross-reference material, not rows to classify.
 */
export function formatContextFiles(files: ContextFileText[] | undefined): string {
  if (!files || files.length === 0) return ""
  const sections = files.map((f) => {
    const body = f.text.length === 0 ? "[empty or unreadable]" : f.text
    const trailer = f.truncated ? "\n\n[...truncated]" : ""
    return `### ${f.fileName} (${f.fileType})\n\n${body}${trailer}`
  })
  return `## Supplementary context from attached files

These files were attached by the user to give you cross-reference material. They are NOT candidate rows to classify — they exist so you can look up context when needed.

${sections.join("\n\n")}

`
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
  const { focused, elidedCount } = pickFocusedCandidates(
    input.candidates,
    input.focusRowIndexes,
    input.userMessage,
  )

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

## Proposing new accounts
When you propose creating a new account for the user, infer its type from the name:
- \`crypto_exchange\` for: Swissborg, Coinbase, Kraken, Binance, Bitstamp, Bit2Me, Bitpanda, Crypto.com, Nexo, KuCoin, Gemini, eToro crypto, Revolut Crypto (separate from the regular Revolut account).
- \`crypto_wallet\` for: MetaMask, Ledger, Trezor, Trust Wallet, Phantom, Rainbow, and any self-custody wallet.
- \`bank\` for clear bank names (BBVA, Santander, N26, Revolut, etc.).
- \`credit_card\` when the row descriptions say "card ending in X", "Visa", "Mastercard", or the account name says card/tarjeta.
- \`cash\` for cash journals or "caja" accounts.

When you emit a proposal in your reply suggesting a new account, include the proposed accountType in your \`assistantMessage\` so the user sees it when confirming.

## Active categorization rules
${formatRules(input.rules)}

## Conversation so far
${formatMessageHistory(input.messages)}

${formatContextFiles(input.contextFiles)}## Current candidate transactions you may update
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

Personal-bucket status assignment (CRITICAL — the two personal buckets mean very different things for tax):
- status="personal_taxable" for: every crypto_disposal (ganancia/pérdida patrimonial, Art. 33 LIRPF), crypto_staking_reward (rendimientos capital mobiliario, Art. 25.2 LIRPF), crypto_airdrop, stock_disposal, stock_dividend, and any row that produces a taxable event on Modelo 100 base del ahorro or rendimientos. These are personal (not business activity) BUT feed Modelo 100 via the FIFO ledger and category-based tax queries.
- status="personal_ignored" for: genuine own-account transfers (EUR withdrawal to the user's bank, crypto transfer between the user's exchanges/wallets), the counter-fiat-leg of a disposal on the bank statement (to avoid double-counting the gain), mistaken deposits, dust-sized conversions, fee-adjustment refunds.

NEVER use personal_ignored on a disposal / reward / airdrop / dividend row. Those go to personal_taxable.

Rules:
- A bank deposit FROM a crypto exchange is NOT ordinary income. It is the fiat leg of a disposal, and the gain is already captured on the disposal row itself. Set status="personal_ignored" (autónomo) or "business_non_deductible" (SL) on the BANK row to avoid double-counting, and create/flag the matching disposal row with status="personal_taxable".
- A disposal (sell of crypto → fiat or crypto → crypto) is a taxable event. Set categoryCode="crypto_disposal" and status="personal_taxable" (autónomo/individual) or "business_non_deductible" (SL). Ask the user for: asset ticker, quantity, and cost basis per unit in EUR. Emit the metadata in extra.crypto — see Output rules below.
- A fiat→crypto transfer is a purchase. Set categoryCode="crypto_purchase" and capture asset + quantity + pricePerUnit in extra.crypto. Purchases are not taxable events; they build cost basis for later FIFO matching. Status="personal_ignored" is fine on purchases since they produce no taxable number on their own.
- Staking rewards, lending interest, and yield-farming payouts go to categoryCode="crypto_staking_reward" with status="personal_taxable" (rendimiento del capital mobiliario, Modelo 100).
- Airdrops/forks go to categoryCode="crypto_airdrop" with status="personal_taxable" and pricePerUnit = fair market value at receipt.
- When cost basis is unknown, keep status="needs_review" and ask the user to paste it from their exchange records. Never guess.
- Emit a taxTip citing "Art. 14.1.c LIRPF" (FIFO obligation) the first time a crypto disposal is classified in a session. Also surface Modelo 721 awareness if the user mentions foreign-exchange holdings over €50K at year-end.

## Stocks / ETFs / funds
A transaction looks broker-related when any of these are true:
- Merchant/sender matches a known broker: Interactive Brokers, Trade Republic, DeGiro, Vanguard, eToro, Revolut Invest, Renta 4, Indexa, MyInvestor, XTB, Scalable Capital.
- Description mentions a common ticker (AAPL, MSFT, VWCE, IWDA, SPY, ...) + BUY/SELL/BROKERAGE/DIVIDENDO keywords.

Rules mirror crypto but use the "stock_" prefix: stock_purchase, stock_disposal, stock_dividend. extra.crypto is reused as the payload (asset=ticker, quantity, pricePerUnit, costBasisPerUnit) — asset_class on the ledger row distinguishes them at query time. Stock gains roll into the same ganancias patrimoniales bucket of Modelo 100 as crypto; dividends go to rendimientos del capital mobiliario (savings bracket). Set status="personal_taxable" on stock_disposal and stock_dividend rows (autónomo/individual) or "business_non_deductible" (SL).

## Personal streams (individual filer or autónomo's personal side)
Salary deposits from an employer (nómina): don't assign a crypto/stock category — instead set status="personal_income" and link an income_source via the /personal/employment page. The wizard only categorizes and flags these for the user to attach.
Rental income: same pattern; link to an income_source of kind=rental.

## Own-account transfers (IMPORTANT — transfers are first-class)

Movements between the user's own accounts are a distinct transaction TYPE, not personal expenses/income. The DB now models them as type="transfer" with a transfer_direction of "outgoing" (on the debited leg) or "incoming" (on the credited leg).

Always classify own-account rows as:
- type: "transfer"
- status: "personal_ignored"

Telltales:
- "Transferencia saliente/entrante" naming the user themselves as counterparty.
- Cash deposit / "ingreso en efectivo" into the user's own account.
- "Sent from <bank>" / "Received from <bank>" with both sides belonging to the user.
- Mistaken deposit + same-day reversal pair — both legs are transfers.

When you see two candidate rows that look like two legs of one transfer (same amount, different accounts, close in time), emit one entry in proposedTransferLinks naming both rowIndex values. When only one leg is visible (user tells you or description clearly implies an off-Taxinator account), emit an entry with rowIndexB=null to mark the row as an orphan transfer.

When proposing an ORPHAN transfer (rowIndexB is null), do your best to set counterAccountId to the UUID of one of the user's existing accounts if the description strongly implies which side is the counter-party. Examples:
- A Swissborg row that says "Deposit ETH" or "from ETH Wallet" + the user has an account named "ETH Wallet" → set counterAccountId to that account's id.
- A Swissborg row "Withdrawal EUR" + the user has BBVA/N26/Revolut → if the description names one specifically, use that; otherwise omit counterAccountId so the UI can ask.
- When genuinely uncertain, omit counterAccountId entirely (the UI will let the user pick manually).

Use the \`id=…\` field from the "Available bank accounts" list when referencing accounts.

TRUST the user when they say "mistake" or "between my accounts" — apply type="transfer" even if the description looks like income.

## Currency conversions within one account (IMPORTANT)

Rows that move money between currencies inside a single account — e.g. Revolut's "Exchanged to EUR", "Exchanged to PLN", "Currency conversion", or similar — are NOT business income/expense. They're an in-account FX operation. Model them as:
- type: "conversion"
- status: "personal_ignored"

Telltales:
- Description contains "Exchanged to <CURRENCY>", "Converted to <CURRENCY>", "FX <PAIR>", "Currency conversion".
- The counterparty field is blank or the same bank as the source account (e.g. "Revolut" on a Revolut statement).
- Two rows on the same date, same account, opposite sign, different currencies.

When you see two candidate rows that look like legs of one conversion (same account, same date, opposite sign, different currencies), emit one entry in proposedTransferLinks naming both rowIndex values — the same machinery that handles transfers also handles conversions once both legs are marked type="conversion". If only one leg is visible (the other side is off-statement or excluded), mark the single row type="conversion" + status="personal_ignored" and leave it orphan.

FX gain/loss computation is pending — for now, just classify the rows correctly. Do NOT try to compute realized_fx_gain_cents yourself.

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
