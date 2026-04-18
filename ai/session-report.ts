import type {
  BusinessFact,
  TaxTip,
  User,
  WizardMessage,
} from "@/lib/db-types"
import { getImportSessionById } from "@/models/import-sessions"
import { getUserById } from "@/models/users"
import { listBusinessFacts } from "@/models/business-facts"
import { getCategories } from "@/models/categories"
import type { TransactionCandidate } from "@/ai/import-csv"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CategoryTotal = {
  code: string
  name: string
  count: number
  amount: number        // cents, summed across committed rows
  taxFormRef: string | null
}

export type StatusTotal = {
  count: number
  amount: number        // cents
}

export type TaxRollups = {
  disposalProceeds: number     // cents — category=crypto_disposal total
  basisPurchases: number       // cents — category=crypto_purchase total
  stakingRewards: number       // cents — category=crypto_staking_reward total
  airdrops: number             // cents — category=crypto_airdrop total
  disposalCount: number
  pendingBasisCount: number    // disposals where extra.crypto.costBasisPerUnit is null/missing
}

export type SessionReport = {
  session: {
    id: string
    title: string | null
    entryMode: string
    fileName: string | null
    fileType: string | null
    createdAt: Date
    committedAt: Date | null
    status: string
    rowCount: number
    bankName: string | null
  }
  user: {
    businessName: string | null
    entityType: string | null
    nif: string | null
  }
  totals: {
    byStatus: Record<string, StatusTotal>
    byCategory: CategoryTotal[]
    deductibleTotal: number          // cents — sum of `business` rows with a category
    nonDeductibleTotal: number       // cents — sum of `business_non_deductible`
    personalTaxableTotal: number     // cents — sum of `personal_taxable`
    personalTotal: number            // cents — sum of `personal_ignored`
    grandTotal: number               // cents — sum of all selected rows
    currencyCode: string | null      // best-effort: dominant currency on the session
  }
  taxRollups: TaxRollups
  taxTipsCollected: TaxTip[]
  businessFactsLearned: BusinessFact[]
  conversationDigest: Array<{
    role: string
    content: string
    createdAt: string
  }>
  generatedAt: Date
  generatedBy: string             // e.g. "wizard-prompt@2026-04-15"
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function buildSessionReport(sessionId: string, userId: string): Promise<SessionReport> {
  const session = await getImportSessionById(sessionId, userId)
  if (!session) throw new Error("Session not found")

  const [user, businessFacts, categories] = await Promise.all([
    getUserById(userId),
    listBusinessFacts(userId),
    getCategories(userId),
  ])
  if (!user) throw new Error("User not found")

  const candidates: TransactionCandidate[] = Array.isArray(session.data)
    ? (session.data as TransactionCandidate[])
    : []
  const messages: WizardMessage[] = Array.isArray(session.messages) ? session.messages : []

  const { totals, taxRollups } = computeTotals(candidates, categories)
  const taxTipsCollected = collectTaxTips(messages)
  const factsForSession = businessFacts.filter((f) => f.learnedFromSessionId === session.id)
  const conversationDigest = buildDigest(messages, 30)

  const bankName =
    session.columnMapping && typeof session.columnMapping === "object" && "bank" in session.columnMapping
      ? String((session.columnMapping as { bank?: unknown }).bank ?? "")
      : null

  return {
    session: {
      id: session.id,
      title: session.title,
      entryMode: session.entryMode,
      fileName: session.fileName,
      fileType: session.fileType,
      createdAt: session.createdAt,
      committedAt: session.status === "committed" ? session.lastActivityAt : null,
      status: session.status,
      rowCount: candidates.length,
      bankName: bankName || null,
    },
    user: userSummary(user),
    totals,
    taxRollups,
    taxTipsCollected,
    businessFactsLearned: factsForSession,
    conversationDigest,
    generatedAt: new Date(),
    generatedBy: session.promptVersion ? `wizard-prompt@${session.promptVersion}` : "wizard-prompt",
  }
}

// ---------------------------------------------------------------------------
// Helpers (exported for tests)
// ---------------------------------------------------------------------------

export function computeTotals(
  candidates: TransactionCandidate[],
  categories: Array<{ code: string; name: unknown; taxFormRef?: string | null }>,
): { totals: SessionReport["totals"]; taxRollups: TaxRollups } {
  const byStatus: Record<string, StatusTotal> = {
    business: { count: 0, amount: 0 },
    business_non_deductible: { count: 0, amount: 0 },
    personal_taxable: { count: 0, amount: 0 },
    personal_ignored: { count: 0, amount: 0 },
    needs_review: { count: 0, amount: 0 },
  }
  const byCategoryMap = new Map<string, CategoryTotal>()
  const currencyTally = new Map<string, number>()

  let deductibleTotal = 0
  let nonDeductibleTotal = 0
  let personalTaxableTotal = 0
  let personalTotal = 0
  let grandTotal = 0

  const taxRollups: TaxRollups = {
    disposalProceeds: 0,
    basisPurchases: 0,
    stakingRewards: 0,
    airdrops: 0,
    disposalCount: 0,
    pendingBasisCount: 0,
  }

  const categoryLookup = new Map<string, { name: unknown; taxFormRef?: string | null }>()
  for (const c of categories) {
    categoryLookup.set(c.code, { name: c.name, taxFormRef: c.taxFormRef ?? null })
  }

  // If no candidate is marked selected (a legacy-bug artifact where commits
  // went through with an empty selected-index list), fall back to counting
  // every candidate that has a terminal review status. That way the report
  // reflects what the wizard saw, rather than showing zeros.
  const anySelected = candidates.some((c) => c.selected)

  for (const c of candidates) {
    if (anySelected && !c.selected) continue
    if (!anySelected && (!c.status || c.status === "needs_review")) continue
    const status = c.status || "needs_review"
    const total = c.total ?? 0

    byStatus[status] ??= { count: 0, amount: 0 }
    byStatus[status].count += 1
    byStatus[status].amount += total
    grandTotal += total

    if (c.currencyCode) {
      currencyTally.set(c.currencyCode, (currencyTally.get(c.currencyCode) ?? 0) + 1)
    }

    if (status === "business") deductibleTotal += total
    else if (status === "business_non_deductible") nonDeductibleTotal += total
    else if (status === "personal_taxable") personalTaxableTotal += total
    else if (status === "personal_ignored") personalTotal += total

    if (c.categoryCode) {
      const meta = categoryLookup.get(c.categoryCode)
      const existing = byCategoryMap.get(c.categoryCode)
      if (existing) {
        existing.count += 1
        existing.amount += total
      } else {
        byCategoryMap.set(c.categoryCode, {
          code: c.categoryCode,
          name: meta ? i18nToPlain(meta.name) : c.categoryCode,
          count: 1,
          amount: total,
          taxFormRef: meta?.taxFormRef ?? null,
        })
      }
    }

    // Tax-meaningful rollups — populate per candidate category. These ignore
    // status because the FIFO ledger and category-based tax queries don't
    // branch on status either. Sum in cents; proceeds/rewards use absolute
    // total so signed bank-like values don't cancel out.
    const categoryCode = c.categoryCode
    if (categoryCode === "crypto_disposal") {
      taxRollups.disposalProceeds += Math.abs(total)
      taxRollups.disposalCount += 1
      const cryptoMeta = c.extra?.crypto
      const hasBasis =
        cryptoMeta !== undefined &&
        cryptoMeta.costBasisPerUnit !== null &&
        cryptoMeta.costBasisPerUnit !== undefined
      if (!hasBasis) {
        taxRollups.pendingBasisCount += 1
      }
    } else if (categoryCode === "crypto_purchase") {
      taxRollups.basisPurchases += Math.abs(total)
    } else if (categoryCode === "crypto_staking_reward") {
      taxRollups.stakingRewards += Math.abs(total)
    } else if (categoryCode === "crypto_airdrop") {
      taxRollups.airdrops += Math.abs(total)
    }
  }

  const byCategory = [...byCategoryMap.values()].sort((a, b) => b.amount - a.amount)
  const currencyCode =
    [...currencyTally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  return {
    totals: {
      byStatus,
      byCategory,
      deductibleTotal,
      nonDeductibleTotal,
      personalTaxableTotal,
      personalTotal,
      grandTotal,
      currencyCode,
    },
    taxRollups,
  }
}

export function collectTaxTips(messages: WizardMessage[]): TaxTip[] {
  const seen = new Set<string>()
  const out: TaxTip[] = []
  for (const m of messages) {
    if (!m.taxTips || m.taxTips.length === 0) continue
    for (const tip of m.taxTips) {
      const fingerprint = `${tip.title}|${tip.legalBasis}`
      if (seen.has(fingerprint)) continue
      seen.add(fingerprint)
      out.push(tip)
    }
  }
  return out
}

function buildDigest(messages: WizardMessage[], max: number): SessionReport["conversationDigest"] {
  const chronological = messages.slice(-max * 2)
  // Prefer turns with substantive content: drop empty assistant fillers.
  const filtered = chronological.filter((m) => m.content.trim().length > 0)
  return filtered.slice(-max).map((m) => ({
    role: m.role,
    content: m.content,
    createdAt: m.createdAt,
  }))
}

function userSummary(user: User): SessionReport["user"] {
  return {
    businessName: user.businessName,
    entityType: (user.entityType as string | null) ?? null,
    nif: user.businessTaxId,
  }
}

function i18nToPlain(value: unknown): string {
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
