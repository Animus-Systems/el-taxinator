/**
 * Routes crypto-tagged transactions into the FIFO ledger. Called from:
 * - wizard commit (server/routes/import.ts) — new transactions
 * - crypto.updateCryptoMeta (lib/trpc/routers/crypto.ts) — edits
 *
 * For purchases/airdrops/staking rewards we insert a lot. For disposals we
 * call recordDisposal which matches FIFO and freezes the gain. Transactions
 * without the required metadata are skipped — the caller should mark them
 * needs_review separately.
 */

import type { Transaction } from "@/lib/db-types"
import type { TransactionCandidate } from "@/ai/import-csv"
import { recordPurchase, recordDisposal } from "@/models/crypto-fifo"

type CryptoMeta = {
  asset?: string
  quantity?: string
  pricePerUnit?: number | null
  costBasisPerUnit?: number | null
}

function pickCryptoMeta(source: { extra?: unknown }): CryptoMeta | null {
  if (!source.extra || typeof source.extra !== "object") return null
  const container = source.extra as { crypto?: unknown }
  if (!container.crypto || typeof container.crypto !== "object") return null
  return container.crypto as CryptoMeta
}

export async function syncCryptoLedger(
  userId: string,
  transaction: Transaction,
  candidate: TransactionCandidate,
): Promise<void> {
  if (!transaction.id) return
  if (!transaction.categoryCode?.startsWith("crypto_")) return

  // Prefer the candidate's in-memory crypto meta since the wizard populates
  // it per-turn; fall back to whatever was persisted on the transaction.
  const meta = pickCryptoMeta(candidate) ?? pickCryptoMeta(transaction)
  if (!meta?.asset || !meta?.quantity) return

  const acquiredAt = transaction.issuedAt ?? new Date()
  const qty = meta.quantity

  switch (transaction.categoryCode) {
    case "crypto_purchase":
    case "crypto_staking_reward":
      if (typeof meta.pricePerUnit !== "number") return
      await recordPurchase({
        userId,
        transactionId: transaction.id,
        asset: meta.asset,
        quantity: qty,
        pricePerUnitCents: meta.pricePerUnit,
        acquiredAt,
      })
      break
    case "crypto_airdrop":
      // Airdrops have no cash outflow; cost basis defaults to 0 but the user
      // may override via the edit dialog (FMV at receipt).
      await recordPurchase({
        userId,
        transactionId: transaction.id,
        asset: meta.asset,
        quantity: qty,
        pricePerUnitCents: typeof meta.pricePerUnit === "number" ? meta.pricePerUnit : 0,
        acquiredAt,
      })
      break
    case "crypto_disposal":
      if (typeof meta.pricePerUnit !== "number") return
      await recordDisposal({
        userId,
        transactionId: transaction.id,
        asset: meta.asset,
        quantity: qty,
        proceedsPerUnitCents: meta.pricePerUnit,
        soldAt: acquiredAt,
      })
      break
    default:
      // crypto_fee — no ledger impact; cost is already baked into lot or proceeds
      break
  }
}
