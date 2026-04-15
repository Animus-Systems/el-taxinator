/**
 * FIFO cost-basis ledger for crypto holdings.
 *
 * Every transaction tagged with `extra.crypto` flows through this module on
 * commit (Phase 2 hook in server/routes/import.ts) and whenever the user
 * edits crypto metadata (tRPC `crypto.updateCryptoMeta`).
 *
 * Lots are the raw acquisition records. Disposal matches freeze the realised
 * gain for each (disposal → lot) pair at match time so the audit trail
 * survives later edits of the source transaction.
 *
 * Precision notes:
 * - `quantity_total` / `quantity_remaining` use `numeric(28,12)` server-side.
 * - Cents-valued money fields are `bigint` server-side and `number` in TS
 *   (the `Number` range covers €92 trillion, which is enough).
 * - Multiplication of `quantity * priceCents` is done in JS with `Number`.
 *   Total precision loss is < 1 cent for normal crypto quantities.
 */

import { randomUUID } from "crypto"
import { sql, queryMany, queryOne, withTransaction, mapRow } from "@/lib/sql"

export type RecordPurchaseInput = {
  userId: string
  transactionId: string | null
  asset: string
  quantity: string           // decimal string, e.g. "0.05"
  pricePerUnitCents: number  // EUR cents at acquisition
  feesCents?: number
  acquiredAt: Date
}

export type RecordDisposalInput = {
  userId: string
  transactionId: string
  asset: string
  quantity: string           // decimal string, e.g. "0.05"
  proceedsPerUnitCents: number // EUR cents at disposal
  soldAt: Date
}

export type CryptoLot = {
  id: string
  userId: string
  asset: string
  acquiredAt: Date
  quantityTotal: string
  quantityRemaining: string
  costPerUnitCents: number
  feesCents: number
  sourceTransactionId: string | null
  createdAt: Date
  updatedAt: Date
}

export type CryptoDisposalMatch = {
  id: string
  userId: string
  disposalTransactionId: string
  lotId: string
  asset: string
  quantityConsumed: string
  costBasisCents: number
  proceedsCents: number
  realizedGainCents: number
  matchedAt: Date
}

export type HoldingSummary = {
  asset: string
  totalQuantity: string            // sum of quantity_remaining
  weightedAvgCostCents: number | null // weighted by remaining qty; null when zero
  openLots: number
}

// ---------------------------------------------------------------------------
// Purchases
// ---------------------------------------------------------------------------

export async function recordPurchase(input: RecordPurchaseInput): Promise<CryptoLot | null> {
  const fees = input.feesCents ?? 0
  const raw = await queryOne<Record<string, unknown>>(
    sql`
      INSERT INTO crypto_lots (
        id, user_id, asset, acquired_at,
        quantity_total, quantity_remaining,
        cost_per_unit_cents, fees_cents, source_transaction_id
      ) VALUES (
        ${randomUUID()},
        ${input.userId},
        ${input.asset},
        ${input.acquiredAt},
        ${input.quantity}::numeric,
        ${input.quantity}::numeric,
        ${input.pricePerUnitCents},
        ${fees},
        ${input.transactionId}
      )
      RETURNING *
    `,
  )
  return raw ? mapLotRow(raw) : null
}

// ---------------------------------------------------------------------------
// Disposals — FIFO matching
// ---------------------------------------------------------------------------

export type DisposalResult = {
  matched: CryptoDisposalMatch[]
  totalQuantityMatched: string
  unmatchedQuantity: string
  totalProceedsCents: number
  totalCostBasisCents: number
  totalRealizedGainCents: number
  weightedAvgCostPerUnitCents: number | null
}

/**
 * Pure FIFO walk: given open lots (oldest-first) and a disposal, produce
 * the match rows and aggregate totals without touching the DB. Extracted
 * so the matching algorithm is unit-testable in isolation.
 */
export type FifoPlanLot = {
  id: string
  quantityRemaining: string
  costPerUnitCents: number
}

export type FifoPlanMatch = {
  lotId: string
  quantityConsumed: number
  costBasisCents: number
  proceedsCents: number
  realizedGainCents: number
}

export type FifoPlanResult = {
  matches: FifoPlanMatch[]
  totalQuantityMatched: number
  unmatchedQuantity: number
  totalProceedsCents: number
  totalCostBasisCents: number
  totalRealizedGainCents: number
  weightedAvgCostPerUnitCents: number | null
}

export function planFifoDisposal(
  lots: FifoPlanLot[],
  disposalQuantity: number,
  proceedsPerUnitCents: number,
): FifoPlanResult {
  const matches: FifoPlanMatch[] = []
  let remaining = disposalQuantity
  let totalQuantityMatched = 0
  let totalProceedsCents = 0
  let totalCostBasisCents = 0
  let totalRealizedGainCents = 0

  for (const lot of lots) {
    if (remaining <= 0) break
    const lotRemaining = Number(lot.quantityRemaining)
    if (!(lotRemaining > 0)) continue
    const take = Math.min(lotRemaining, remaining)
    const proceedsCents = Math.round(take * proceedsPerUnitCents)
    const costBasisCents = Math.round(take * lot.costPerUnitCents)
    const gainCents = proceedsCents - costBasisCents
    matches.push({
      lotId: lot.id,
      quantityConsumed: take,
      costBasisCents,
      proceedsCents,
      realizedGainCents: gainCents,
    })
    totalQuantityMatched += take
    totalProceedsCents += proceedsCents
    totalCostBasisCents += costBasisCents
    totalRealizedGainCents += gainCents
    remaining -= take
  }

  const weightedAvgCostPerUnitCents =
    totalQuantityMatched > 0
      ? Math.round(totalCostBasisCents / totalQuantityMatched)
      : null

  return {
    matches,
    totalQuantityMatched,
    unmatchedQuantity: Math.max(0, remaining),
    totalProceedsCents,
    totalCostBasisCents,
    totalRealizedGainCents,
    weightedAvgCostPerUnitCents,
  }
}

/**
 * Consume lots oldest-first for a disposal. Returns the set of matches and
 * aggregate P&L. If there aren't enough lots to satisfy the disposal, the
 * remaining quantity stays unmatched — callers are expected to surface this
 * as a review flag (no-acquisition-history case).
 */
export async function recordDisposal(input: RecordDisposalInput): Promise<DisposalResult> {
  return withTransaction(async (client) => {
    // Delete any prior matches for this exact disposal so edits are idempotent.
    await client.query(
      `DELETE FROM crypto_disposal_matches
       WHERE user_id = $1 AND disposal_transaction_id = $2
       RETURNING id, asset, lot_id, quantity_consumed`,
      [input.userId, input.transactionId],
    )
    // Restore any quantity previously consumed by this disposal back onto its lots.
    await client.query(
      `UPDATE crypto_lots l
       SET quantity_remaining = quantity_remaining + m.qty,
           updated_at = now()
       FROM (
         SELECT lot_id, SUM(quantity_consumed) AS qty
         FROM crypto_disposal_matches
         WHERE user_id = $1 AND disposal_transaction_id = $2
         GROUP BY lot_id
       ) m
       WHERE l.id = m.lot_id`,
      [input.userId, input.transactionId],
    )

    const lotsResult = await client.query<Record<string, unknown>>(
      `SELECT * FROM crypto_lots
       WHERE user_id = $1 AND asset = $2 AND quantity_remaining > 0
       ORDER BY acquired_at ASC, created_at ASC`,
      [input.userId, input.asset],
    )
    const lots = lotsResult.rows.map((r) => mapRow<CryptoLot>(r))

    const plan = planFifoDisposal(
      lots.map((l) => ({
        id: l.id,
        quantityRemaining: l.quantityRemaining,
        costPerUnitCents: Number(l.costPerUnitCents),
      })),
      Number(input.quantity),
      input.proceedsPerUnitCents,
    )

    const matches: CryptoDisposalMatch[] = []
    for (const m of plan.matches) {
      const matchId = randomUUID()
      const insert = await client.query<Record<string, unknown>>(
        `INSERT INTO crypto_disposal_matches (
           id, user_id, disposal_transaction_id, lot_id, asset,
           quantity_consumed, cost_basis_cents, proceeds_cents, realized_gain_cents,
           matched_at
         ) VALUES ($1, $2, $3, $4, $5, $6::numeric, $7, $8, $9, $10)
         RETURNING *`,
        [
          matchId,
          input.userId,
          input.transactionId,
          m.lotId,
          input.asset,
          m.quantityConsumed.toString(),
          m.costBasisCents,
          m.proceedsCents,
          m.realizedGainCents,
          input.soldAt,
        ],
      )
      matches.push(mapRow<CryptoDisposalMatch>(insert.rows[0]))

      await client.query(
        `UPDATE crypto_lots
         SET quantity_remaining = quantity_remaining - $1::numeric,
             updated_at = now()
         WHERE id = $2`,
        [m.quantityConsumed.toString(), m.lotId],
      )
    }

    return {
      matched: matches,
      totalQuantityMatched: plan.totalQuantityMatched.toString(),
      unmatchedQuantity: plan.unmatchedQuantity.toString(),
      totalProceedsCents: plan.totalProceedsCents,
      totalCostBasisCents: plan.totalCostBasisCents,
      totalRealizedGainCents: plan.totalRealizedGainCents,
      weightedAvgCostPerUnitCents: plan.weightedAvgCostPerUnitCents,
    }
  })
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getHoldings(userId: string): Promise<HoldingSummary[]> {
  type Row = {
    asset: string
    totalQuantity: string
    weightedAvgCostCents: string | null
    openLots: string
  }
  const rows = await queryMany<Row>(
    sql`
      SELECT
        asset,
        COALESCE(SUM(quantity_remaining)::text, '0') AS total_quantity,
        CASE WHEN SUM(quantity_remaining) > 0
          THEN ROUND(SUM(quantity_remaining * cost_per_unit_cents) / SUM(quantity_remaining))::text
          ELSE NULL
        END AS weighted_avg_cost_cents,
        COUNT(*)::text AS open_lots
      FROM crypto_lots
      WHERE user_id = ${userId} AND quantity_remaining > 0
      GROUP BY asset
      ORDER BY asset ASC
    `,
  )
  return rows.map((r) => ({
    asset: r.asset,
    totalQuantity: r.totalQuantity,
    weightedAvgCostCents: r.weightedAvgCostCents === null ? null : Number(r.weightedAvgCostCents),
    openLots: Number(r.openLots),
  }))
}

export async function getDisposalMatches(
  userId: string,
  disposalTransactionId: string,
): Promise<CryptoDisposalMatch[]> {
  const rows = await queryMany<Record<string, unknown>>(
    sql`
      SELECT * FROM crypto_disposal_matches
      WHERE user_id = ${userId}
        AND disposal_transaction_id = ${disposalTransactionId}
      ORDER BY matched_at ASC
    `,
  )
  return rows.map(mapMatchRow)
}

export async function listLots(userId: string, asset?: string): Promise<CryptoLot[]> {
  const rows = await queryMany<Record<string, unknown>>(
    asset
      ? sql`SELECT * FROM crypto_lots
            WHERE user_id = ${userId} AND asset = ${asset}
            ORDER BY acquired_at DESC`
      : sql`SELECT * FROM crypto_lots
            WHERE user_id = ${userId}
            ORDER BY acquired_at DESC`,
  )
  return rows.map(mapLotRow)
}

export async function sumRealizedGainForYear(
  userId: string,
  year: number,
): Promise<number> {
  type Row = { total: string | null }
  const row = await queryOne<Row>(
    sql`
      SELECT COALESCE(SUM(realized_gain_cents), 0)::text AS total
      FROM crypto_disposal_matches
      WHERE user_id = ${userId}
        AND EXTRACT(YEAR FROM matched_at) = ${year}
    `,
  )
  return Number(row?.total ?? 0)
}

// ---------------------------------------------------------------------------
// Replay — wipe + rebuild from `transactions.extra.crypto`
// ---------------------------------------------------------------------------

type CryptoTxRow = {
  id: string
  issuedAt: Date | null
  categoryCode: string | null
  extra: { crypto?: Record<string, unknown> } | null
}

/**
 * Wipe all lots + matches for the user and replay every crypto-tagged
 * transaction chronologically. Used for recovery when the ledger drifts
 * (e.g. the user edited transactions manually without going through the
 * wizard or /crypto edit dialog).
 */
export async function replayFromTransactions(userId: string): Promise<{
  lotsCreated: number
  disposalsMatched: number
  totalRealizedGainCents: number
}> {
  return withTransaction(async (client) => {
    await client.query(`DELETE FROM crypto_disposal_matches WHERE user_id = $1`, [userId])
    await client.query(`DELETE FROM crypto_lots WHERE user_id = $1`, [userId])

    const txRes = await client.query<CryptoTxRow>(
      `SELECT id, issued_at, category_code, extra
       FROM transactions
       WHERE user_id = $1 AND (extra ? 'crypto')
       ORDER BY issued_at ASC NULLS LAST, id ASC`,
      [userId],
    )

    let lotsCreated = 0
    let disposalsMatched = 0
    let totalRealizedGainCents = 0

    for (const tx of txRes.rows) {
      const meta = (tx.extra?.crypto ?? {}) as Record<string, unknown>
      const asset = typeof meta.asset === "string" ? meta.asset : null
      const qtyStr = typeof meta.quantity === "string" ? meta.quantity : null
      if (!asset || !qtyStr) continue
      const issuedAt = tx.issuedAt ?? new Date()

      if (tx.categoryCode === "crypto_purchase" || tx.categoryCode === "crypto_airdrop") {
        const pricePerUnit =
          typeof meta.pricePerUnit === "number"
            ? meta.pricePerUnit
            : tx.categoryCode === "crypto_airdrop"
              ? 0
              : null
        if (pricePerUnit === null) continue
        await client.query(
          `INSERT INTO crypto_lots (
             id, user_id, asset, acquired_at,
             quantity_total, quantity_remaining,
             cost_per_unit_cents, fees_cents, source_transaction_id
           ) VALUES ($1, $2, $3, $4, $5::numeric, $5::numeric, $6, 0, $7)`,
          [randomUUID(), userId, asset, issuedAt, qtyStr, pricePerUnit, tx.id],
        )
        lotsCreated += 1
      } else if (tx.categoryCode === "crypto_disposal") {
        const price =
          typeof meta.pricePerUnit === "number" ? meta.pricePerUnit : null
        if (price === null) continue

        const lotsRes = await client.query<Record<string, unknown>>(
          `SELECT * FROM crypto_lots
           WHERE user_id = $1 AND asset = $2 AND quantity_remaining > 0
           ORDER BY acquired_at ASC, created_at ASC`,
          [userId, asset],
        )
        const lots = lotsRes.rows.map((r) => mapRow<CryptoLot>(r))
        const plan = planFifoDisposal(
          lots.map((l) => ({
            id: l.id,
            quantityRemaining: l.quantityRemaining,
            costPerUnitCents: Number(l.costPerUnitCents),
          })),
          Number(qtyStr),
          price,
        )
        for (const m of plan.matches) {
          await client.query(
            `INSERT INTO crypto_disposal_matches (
               id, user_id, disposal_transaction_id, lot_id, asset,
               quantity_consumed, cost_basis_cents, proceeds_cents, realized_gain_cents,
               matched_at
             ) VALUES ($1, $2, $3, $4, $5, $6::numeric, $7, $8, $9, $10)`,
            [
              randomUUID(),
              userId,
              tx.id,
              m.lotId,
              asset,
              m.quantityConsumed.toString(),
              m.costBasisCents,
              m.proceedsCents,
              m.realizedGainCents,
              issuedAt,
            ],
          )
          await client.query(
            `UPDATE crypto_lots
             SET quantity_remaining = quantity_remaining - $1::numeric,
                 updated_at = now()
             WHERE id = $2`,
            [m.quantityConsumed.toString(), m.lotId],
          )
        }
        totalRealizedGainCents += plan.totalRealizedGainCents
        disposalsMatched += 1
      }
    }

    return { lotsCreated, disposalsMatched, totalRealizedGainCents }
  })
}

// ---------------------------------------------------------------------------
// Helpers
//
// node-pg returns `bigint` columns as strings by default (and the project
// doesn't register a type parser globally). Cents-valued columns need manual
// conversion to `number`.
// ---------------------------------------------------------------------------

function mapLotRow(raw: Record<string, unknown>): CryptoLot {
  const mapped = mapRow<CryptoLot & { costPerUnitCents: unknown; feesCents: unknown }>(raw)
  return {
    ...mapped,
    costPerUnitCents: Number(mapped.costPerUnitCents ?? 0),
    feesCents: Number(mapped.feesCents ?? 0),
  }
}

function mapMatchRow(raw: Record<string, unknown>): CryptoDisposalMatch {
  const mapped = mapRow<
    CryptoDisposalMatch & {
      costBasisCents: unknown
      proceedsCents: unknown
      realizedGainCents: unknown
    }
  >(raw)
  return {
    ...mapped,
    costBasisCents: Number(mapped.costBasisCents ?? 0),
    proceedsCents: Number(mapped.proceedsCents ?? 0),
    realizedGainCents: Number(mapped.realizedGainCents ?? 0),
  }
}
