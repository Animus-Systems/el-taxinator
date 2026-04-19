import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { router, authedProcedure } from "../init"
import { sql, queryMany } from "@/lib/sql"
import { cryptoMetaSchema, type Transaction } from "@/lib/db-types"
import { getTransactionById, updateTransaction } from "@/models/transactions"
import { getUserById } from "@/models/users"
import {
  getHoldings,
  getDisposalMatches,
  replayFromTransactions,
} from "@/models/crypto-fifo"
import { backfillCryptoMetadataFromImportFiles } from "@/models/crypto-backfill"

// ---------------------------------------------------------------------------
// Output schemas
// ---------------------------------------------------------------------------

const cryptoDisposalRowSchema = z.object({
  id: z.string(),
  issuedAt: z.date().nullable(),
  name: z.string().nullable(),
  merchant: z.string().nullable(),
  total: z.number().nullable(),
  currencyCode: z.string().nullable(),
  categoryCode: z.string().nullable(),
  accountId: z.string().nullable(),
  status: z.string().nullable(),
  crypto: cryptoMetaSchema.partial(),
  gatewayLinked: z.boolean(),
})

const cryptoSummarySchema = z.object({
  year: z.number(),
  totalProceedsCents: z.number(),
  totalCostBasisCents: z.number(),
  realizedGainCents: z.number(),
  byAsset: z.array(
    z.object({
      asset: z.string(),
      quantity: z.string(),
      realizedGainCents: z.number(),
      disposalCount: z.number(),
    }),
  ),
  untrackedDisposalsCount: z.number(),
  // Diagnostic counters — surfaced on /crypto to explain zero totals.
  disposalRowCount: z.number(),
  disposalRowsWithFifoMatch: z.number(),
  disposalRowsMissingPrice: z.number(),
})

const holdingSchema = z.object({
  asset: z.string(),
  totalQuantity: z.string(),
  weightedAvgCostCents: z.number().nullable(),
  openLots: z.number(),
})

const disposalMatchSchema = z.object({
  id: z.string(),
  lotId: z.string(),
  asset: z.string(),
  quantityConsumed: z.string(),
  costBasisCents: z.number(),
  proceedsCents: z.number(),
  realizedGainCents: z.number(),
  matchedAt: z.date(),
})

const replayResultSchema = z.object({
  lotsCreated: z.number(),
  disposalsMatched: z.number(),
  totalRealizedGainCents: z.number(),
})

const gatewaySuggestionSchema = z.object({
  disposalTransactionId: z.string(),
  disposalIssuedAt: z.date().nullable(),
  disposalAsset: z.string().nullable(),
  disposalQuantity: z.string().nullable(),
  disposalProceedsCents: z.number().nullable(),
  bankTransactionId: z.string(),
  bankIssuedAt: z.date().nullable(),
  bankTotalCents: z.number().nullable(),
  bankAccountName: z.string().nullable(),
  daysApart: z.number(),
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CryptoRow = Transaction & {
  extra: { crypto?: Record<string, unknown> } | null
}

type CryptoMetaPartial = z.infer<ReturnType<typeof cryptoMetaSchema.partial>>

function pickCryptoMeta(row: CryptoRow): CryptoMetaPartial {
  const raw = (row.extra?.crypto ?? {}) as Record<string, unknown>
  // Re-parse through the schema so clients always get the canonical shape.
  const parsed = cryptoMetaSchema.partial().safeParse(raw)
  return parsed.success ? parsed.data : {}
}

function isInternalTransferStatus(entityType: string | null): "personal_ignored" | "business_non_deductible" {
  return entityType === "sl" ? "business_non_deductible" : "personal_ignored"
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const cryptoRouter = router({
  /**
   * List disposals — transactions tagged with `extra.crypto` and category
   * `crypto_disposal`. Ordered newest-first.
   */
  listDisposals: authedProcedure
    .input(
      z.object({
        year: z.number().int().nullable().optional(),
        asset: z.string().nullable().optional(),
        accountId: z.string().nullable().optional(),
      }).optional(),
    )
    .output(z.array(cryptoDisposalRowSchema))
    .query(async ({ ctx, input }) => {
      const year = input?.year ?? null
      const asset = input?.asset ?? null
      const accountId = input?.accountId ?? null

      const rows = await queryMany<CryptoRow>(
        sql`
          SELECT *
          FROM transactions
          WHERE user_id = ${ctx.user.id}
            AND category_code = 'crypto_disposal'
            AND (extra ? 'crypto')
            AND (${year}::int IS NULL OR EXTRACT(YEAR FROM issued_at) = ${year})
            AND (${asset}::text IS NULL OR (extra -> 'crypto' ->> 'asset') = ${asset})
            AND (${accountId}::uuid IS NULL OR account_id = ${accountId}::uuid)
          ORDER BY issued_at DESC NULLS LAST, id DESC
          LIMIT 500
        `,
      )

      return rows.map((r) => {
        const meta = pickCryptoMeta(r)
        return {
          id: r.id,
          issuedAt: r.issuedAt ?? null,
          name: r.name ?? null,
          merchant: r.merchant ?? null,
          total: r.total ?? null,
          currencyCode: r.currencyCode ?? null,
          categoryCode: r.categoryCode ?? null,
          accountId: r.accountId ?? null,
          status: r.status ?? null,
          crypto: meta,
          gatewayLinked: Boolean(meta.gatewayTransactionId),
        }
      })
    }),

  /**
   * Per-period summary — drives the /crypto page header and the sidebar
   * untracked-disposals badge.
   */
  summary: authedProcedure
    .input(
      z.object({
        year: z.number().int().nullable().optional(),
      }).optional(),
    )
    .output(cryptoSummarySchema)
    .query(async ({ ctx, input }) => {
      const year = input?.year ?? new Date().getFullYear()

      const rows = await queryMany<CryptoRow>(
        sql`
          SELECT *
          FROM transactions
          WHERE user_id = ${ctx.user.id}
            AND category_code = 'crypto_disposal'
            AND (extra ? 'crypto')
            AND EXTRACT(YEAR FROM issued_at) = ${year}
        `,
      )

      // Pull FIFO-authoritative totals per disposal transaction for this year.
      type FifoRow = {
        disposalTransactionId: string
        costBasisCents: string
        proceedsCents: string
        realizedGainCents: string
      }
      const fifoRows = await queryMany<FifoRow>(
        sql`
          SELECT
            disposal_transaction_id,
            SUM(cost_basis_cents)::text AS cost_basis_cents,
            SUM(proceeds_cents)::text AS proceeds_cents,
            SUM(realized_gain_cents)::text AS realized_gain_cents
          FROM crypto_disposal_matches
          WHERE user_id = ${ctx.user.id}
            AND EXTRACT(YEAR FROM matched_at) = ${year}
          GROUP BY disposal_transaction_id
        `,
      )
      const fifoByTx = new Map<string, { cost: number; proceeds: number; gain: number }>()
      for (const f of fifoRows) {
        fifoByTx.set(f.disposalTransactionId, {
          cost: Number(f.costBasisCents),
          proceeds: Number(f.proceedsCents),
          gain: Number(f.realizedGainCents),
        })
      }

      let totalProceedsCents = 0
      let totalCostBasisCents = 0
      let realizedGainCents = 0
      let untrackedDisposalsCount = 0
      let disposalRowsWithFifoMatch = 0
      let disposalRowsMissingPrice = 0
      const perAsset = new Map<string, { quantity: number; realizedGainCents: number; disposalCount: number }>()

      for (const r of rows) {
        const m = pickCryptoMeta(r)
        const qtyStr = typeof m.quantity === "string" ? m.quantity : "0"
        const qty = Number(qtyStr) || 0
        const price = typeof m.pricePerUnit === "number" ? m.pricePerUnit : null
        const cost = typeof m.costBasisPerUnit === "number" ? m.costBasisPerUnit : null
        const candidateGain = typeof m.realizedGainCents === "number" ? m.realizedGainCents : null
        const asset = typeof m.asset === "string" ? m.asset : "UNKNOWN"

        // Prefer FIFO-authoritative numbers; fall back to the candidate meta
        // when the ledger hasn't been populated yet (e.g. before first replay).
        const fifo = fifoByTx.get(r.id)
        if (fifo !== undefined) disposalRowsWithFifoMatch += 1
        const proceedsForRow =
          fifo?.proceeds ?? (price !== null ? Math.round(price * qty) : null)
        const costForRow =
          fifo?.cost ?? (cost !== null ? Math.round(cost * qty) : null)
        const gainForRow = fifo?.gain ?? candidateGain

        if (costForRow === null) untrackedDisposalsCount += 1
        if (proceedsForRow === null) disposalRowsMissingPrice += 1
        if (proceedsForRow !== null) totalProceedsCents += proceedsForRow
        if (costForRow !== null) totalCostBasisCents += costForRow
        if (gainForRow !== null) realizedGainCents += gainForRow

        const prev = perAsset.get(asset) ?? { quantity: 0, realizedGainCents: 0, disposalCount: 0 }
        prev.quantity += qty
        prev.realizedGainCents += gainForRow ?? 0
        prev.disposalCount += 1
        perAsset.set(asset, prev)
      }

      const byAsset = [...perAsset.entries()]
        .map(([asset, v]) => ({
          asset,
          quantity: v.quantity.toString(),
          realizedGainCents: v.realizedGainCents,
          disposalCount: v.disposalCount,
        }))
        .sort((a, b) => b.realizedGainCents - a.realizedGainCents)

      return {
        year,
        totalProceedsCents,
        totalCostBasisCents,
        realizedGainCents,
        byAsset,
        untrackedDisposalsCount,
        disposalRowCount: rows.length,
        disposalRowsWithFifoMatch,
        disposalRowsMissingPrice,
      }
    }),

  /**
   * Distinct years in which this user has any crypto-tagged transactions.
   * Used by /crypto to default the year picker to the most recent year with
   * real data, instead of the current year (which is usually empty for new
   * users who just imported historical exchange exports).
   */
  availableYears: authedProcedure
    .input(z.object({}).optional())
    .output(z.array(z.number().int()))
    .query(async ({ ctx }) => {
      type Row = { year: number }
      const rows = await queryMany<Row>(
        sql`
          SELECT DISTINCT EXTRACT(YEAR FROM issued_at)::int AS year
          FROM transactions
          WHERE user_id = ${ctx.user.id}
            AND (extra ? 'crypto')
            AND issued_at IS NOT NULL
          ORDER BY year DESC
        `,
      )
      return rows.map((r) => r.year)
    }),

  /**
   * Pair a bank deposit with a crypto disposal. The bank row flips to
   * personal_ignored (autónomo) or business_non_deductible (SL) so it's not
   * double-counted. The disposal keeps the tax burden via its extra.crypto.
   */
  linkGateway: authedProcedure
    .input(
      z.object({
        disposalTransactionId: z.string().uuid(),
        gatewayTransactionId: z.string().uuid(),
      }),
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const disposal = await getTransactionById(input.disposalTransactionId, ctx.user.id)
      const bank = await getTransactionById(input.gatewayTransactionId, ctx.user.id)
      if (!disposal || !bank) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" })
      }

      const currentExtra = (disposal.extra ?? {}) as Record<string, unknown>
      const currentCrypto = (currentExtra["crypto"] ?? {}) as Record<string, unknown>
      const nextCrypto = { ...currentCrypto, gatewayTransactionId: input.gatewayTransactionId }
      const nextExtra = { ...currentExtra, crypto: nextCrypto }

      await updateTransaction(input.disposalTransactionId, ctx.user.id, {
        extra: nextExtra,
      })

      const user = await getUserById(ctx.user.id)
      const internalStatus = isInternalTransferStatus(user?.entityType ?? null)
      await updateTransaction(input.gatewayTransactionId, ctx.user.id, {
        status: internalStatus,
      })

      return { success: true }
    }),

  /**
   * Suggest gateway pairings — find unlinked bank deposits within ±5 days
   * and ±10% EUR of an unlinked disposal. Client renders as suggestions.
   */
  suggestGatewayLinks: authedProcedure
    .input(z.object({}).optional())
    .output(z.array(gatewaySuggestionSchema))
    .query(async ({ ctx }) => {
      const disposals = await queryMany<CryptoRow>(
        sql`
          SELECT *
          FROM transactions
          WHERE user_id = ${ctx.user.id}
            AND category_code = 'crypto_disposal'
            AND (extra ? 'crypto')
            AND (extra -> 'crypto' -> 'gatewayTransactionId' IS NULL
                 OR extra -> 'crypto' ->> 'gatewayTransactionId' = '')
          ORDER BY issued_at DESC NULLS LAST
          LIMIT 100
        `,
      )
      if (disposals.length === 0) return []

      const bankDeposits = await queryMany<Transaction & { accountName: string | null }>(
        sql`
          SELECT t.*, a.name AS account_name
          FROM transactions t
          LEFT JOIN accounts a ON a.id = t.account_id
          WHERE t.user_id = ${ctx.user.id}
            AND t.type = 'income'
            AND t.total > 0
            AND (t.extra IS NULL OR NOT (t.extra ? 'crypto'))
            AND (a.account_type IS NULL OR a.account_type = 'bank')
          ORDER BY t.issued_at DESC NULLS LAST
          LIMIT 300
        `,
      )

      const suggestions: z.infer<typeof gatewaySuggestionSchema>[] = []
      for (const d of disposals) {
        const m = pickCryptoMeta(d)
        const qtyStr = typeof m.quantity === "string" ? m.quantity : "0"
        const qty = Number(qtyStr) || 0
        const price = typeof m.pricePerUnit === "number" ? m.pricePerUnit : null
        const proceedsCents = price !== null ? Math.round(price * qty) : null
        if (proceedsCents === null || !d.issuedAt) continue

        let best: { bank: (typeof bankDeposits)[number]; daysApart: number } | null = null
        for (const b of bankDeposits) {
          if (!b.issuedAt || b.total === null) continue
          const daysApart = Math.abs(
            (new Date(d.issuedAt).getTime() - new Date(b.issuedAt).getTime()) / 86400000,
          )
          if (daysApart > 5) continue
          const pctDiff = Math.abs((b.total - proceedsCents) / Math.max(proceedsCents, 1))
          if (pctDiff > 0.1) continue
          if (!best || daysApart < best.daysApart) {
            best = { bank: b, daysApart }
          }
        }
        if (!best) continue

        suggestions.push({
          disposalTransactionId: d.id,
          disposalIssuedAt: d.issuedAt ?? null,
          disposalAsset: typeof m.asset === "string" ? m.asset : null,
          disposalQuantity: qtyStr,
          disposalProceedsCents: proceedsCents,
          bankTransactionId: best.bank.id,
          bankIssuedAt: best.bank.issuedAt ?? null,
          bankTotalCents: best.bank.total ?? null,
          bankAccountName: best.bank.accountName ?? null,
          daysApart: Math.round(best.daysApart),
        })
      }
      return suggestions
    }),

  /**
   * Edit extra.crypto on a transaction (asset, quantity, prices). Recomputes
   * realizedGainCents from the merged values.
   */
  updateCryptoMeta: authedProcedure
    .input(
      z.object({
        transactionId: z.string().uuid(),
        crypto: cryptoMetaSchema.partial(),
      }),
    )
    .output(z.object({ success: z.boolean(), realizedGainCents: z.number().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await getTransactionById(input.transactionId, ctx.user.id)
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" })
      }
      const prevExtra = (existing.extra ?? {}) as Record<string, unknown>
      const prevCrypto = (prevExtra["crypto"] ?? {}) as Record<string, unknown>
      const nextCrypto: Record<string, unknown> = { ...prevCrypto, ...input.crypto }

      const price = typeof nextCrypto["pricePerUnit"] === "number" ? nextCrypto["pricePerUnit"] : null
      const cost = typeof nextCrypto["costBasisPerUnit"] === "number" ? nextCrypto["costBasisPerUnit"] : null
      const qtyStr = typeof nextCrypto["quantity"] === "string" ? nextCrypto["quantity"] : "0"
      const qty = Number(qtyStr) || 0
      const realizedGainCents =
        price !== null && cost !== null && qty !== 0 ? Math.round((price - cost) * qty) : null
      nextCrypto["realizedGainCents"] = realizedGainCents

      const nextExtra = { ...prevExtra, crypto: nextCrypto }
      await updateTransaction(input.transactionId, ctx.user.id, { extra: nextExtra })

      // Replay the FIFO ledger so holdings + matched gains stay consistent
      // with the edited metadata. Cheap in typical cases; the admin "Replay
      // FIFO" button exists for extreme sizes.
      try {
        await replayFromTransactions(ctx.user.id)
      } catch (err) {
        console.error("[crypto] replay after updateCryptoMeta failed:", err)
      }

      return { success: true, realizedGainCents }
    }),

  /**
   * Open holdings per asset — drives the Holdings tab on /crypto.
   */
  holdings: authedProcedure
    .input(z.object({}).optional())
    .output(z.array(holdingSchema))
    .query(async ({ ctx }) => {
      return getHoldings(ctx.user.id)
    }),

  /**
   * Matched lots for a given disposal — shown in the expander on /crypto.
   */
  listDisposalMatches: authedProcedure
    .input(z.object({ disposalTransactionId: z.string().uuid() }))
    .output(z.array(disposalMatchSchema))
    .query(async ({ ctx, input }) => {
      const matches = await getDisposalMatches(ctx.user.id, input.disposalTransactionId)
      return matches.map((m) => ({
        id: m.id,
        lotId: m.lotId,
        asset: m.asset,
        quantityConsumed: m.quantityConsumed,
        costBasisCents: m.costBasisCents,
        proceedsCents: m.proceedsCents,
        realizedGainCents: m.realizedGainCents,
        matchedAt: m.matchedAt,
      }))
    }),

  /**
   * Replay the FIFO ledger from all crypto-tagged transactions. Surfaced
   * behind an admin button on /crypto; used for recovery when the ledger
   * drifts or when the v9 migration first runs over existing data.
   */
  replayFifo: authedProcedure
    .input(z.object({}).optional())
    .output(replayResultSchema)
    .mutation(async ({ ctx }) => {
      return replayFromTransactions(ctx.user.id)
    }),

  /**
   * Re-derive `extra.crypto` on already-committed transactions whose
   * metadata was dropped at import time. Reads each import session's
   * original upload from disk and stamps structured {asset, quantity,
   * pricePerUnit} onto the matching transactions, then replays FIFO.
   *
   * Safe to run repeatedly — the UPDATE skips rows that already have
   * `extra.crypto` set.
   */
  backfillMetadata: authedProcedure
    .input(z.object({}).optional())
    .output(
      z.object({
        sessionsScanned: z.number(),
        sessionsWithMissingFile: z.number(),
        candidatesConsidered: z.number(),
        transactionsUpdated: z.number(),
        transactionsSkipped: z.number(),
        fifoReplay: replayResultSchema.nullable(),
      }),
    )
    .mutation(async ({ ctx }) => {
      return backfillCryptoMetadataFromImportFiles(ctx.user.id)
    }),
})
