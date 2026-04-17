import { randomUUID } from "crypto"
import { sql, queryMany, withTransaction } from "@/lib/sql"
import type { Transaction } from "@/lib/db-types"

export type MatchKind = "outgoing" | "incoming"

export type FindTransferMatchInput = {
  selfId: string | null
  userId: string
  accountId: string
  total: number
  currencyCode: string
  issuedAt: Date
  kind: MatchKind
}

export type TransferMatchResult =
  | { kind: "unique"; match: Transaction }
  | { kind: "ambiguous"; candidates: Transaction[] }
  | { kind: "none" }

/**
 * Find a row that could pair with the given transaction to form a transfer.
 *
 * Strict criteria:
 *   - same user, different account
 *   - absolute-value amount equal, same currency
 *   - issued_at within ±1 day
 *   - not already paired (transfer_id IS NULL)
 *   - opposite direction (outgoing looks for an income or an orphan-incoming;
 *     incoming looks for an expense or an orphan-outgoing)
 */
export async function findTransferMatch(
  input: FindTransferMatchInput,
): Promise<TransferMatchResult> {
  const { selfId, userId, accountId, total, currencyCode, issuedAt, kind } = input
  const oppositeType = kind === "outgoing" ? "income" : "expense"
  const oppositeDirection = kind === "outgoing" ? "incoming" : "outgoing"
  const oneDayMs = 24 * 60 * 60 * 1000
  const lower = new Date(issuedAt.getTime() - oneDayMs)
  const upper = new Date(issuedAt.getTime() + oneDayMs)
  const zeroUuid = "00000000-0000-0000-0000-000000000000"

  const rows = await queryMany<Transaction>(
    sql`SELECT * FROM transactions
        WHERE user_id = ${userId}
          AND id <> ${selfId ?? zeroUuid}
          AND account_id IS NOT NULL
          AND account_id <> ${accountId}
          AND ABS(total) = ABS(${total})
          AND currency_code = ${currencyCode}
          AND issued_at >= ${lower}
          AND issued_at <= ${upper}
          AND transfer_id IS NULL
          AND (
            type = ${oppositeType}
            OR (type = 'transfer' AND transfer_direction = ${oppositeDirection})
          )
        LIMIT 2`,
  )

  if (rows.length === 0) return { kind: "none" }
  if (rows.length === 1) return { kind: "unique", match: rows[0]! }
  return { kind: "ambiguous", candidates: rows }
}

export type LinkTransferPairInput = {
  userId: string
  outgoingId: string
  outgoingAccountId: string
  incomingId: string
  incomingAccountId: string
}

/**
 * Atomically links two rows into a transfer. Both legs get `type='transfer'`,
 * the same `transfer_id`, opposite `transfer_direction`, and each other's
 * `counter_account_id`. The pre-migration `type` is stashed in
 * `extra.preMigrationType` so a later unlink can restore it.
 */
export async function linkTransferPair(
  input: LinkTransferPairInput,
): Promise<{ transferId: string }> {
  const { userId, outgoingId, outgoingAccountId, incomingId, incomingAccountId } = input
  const transferId = randomUUID()

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE transactions
         SET type = 'transfer',
             transfer_id = $1,
             transfer_direction = 'outgoing',
             counter_account_id = $2,
             extra = COALESCE(extra, '{}'::jsonb)
                   || jsonb_build_object('preMigrationType', type)
       WHERE id = $3 AND user_id = $4`,
      [transferId, incomingAccountId, outgoingId, userId],
    )
    await client.query(
      `UPDATE transactions
         SET type = 'transfer',
             transfer_id = $1,
             transfer_direction = 'incoming',
             counter_account_id = $2,
             extra = COALESCE(extra, '{}'::jsonb)
                   || jsonb_build_object('preMigrationType', type)
       WHERE id = $3 AND user_id = $4`,
      [transferId, outgoingAccountId, incomingId, userId],
    )
  })

  return { transferId }
}

/**
 * Called after inserting a new transaction. If the new row looks like a
 * transfer candidate (type expense/income + has account_id), run the matcher
 * and auto-link on a unique match. No-op for type=other/transfer already.
 */
export async function maybePairNewTransaction(tx: Transaction): Promise<void> {
  if (!tx.accountId || !tx.total || !tx.currencyCode || !tx.issuedAt) return
  if (tx.type !== "expense" && tx.type !== "income") return

  const kind: MatchKind = tx.type === "expense" ? "outgoing" : "incoming"
  const match = await findTransferMatch({
    selfId: tx.id,
    userId: tx.userId,
    accountId: tx.accountId,
    total: tx.total,
    currencyCode: tx.currencyCode,
    issuedAt: new Date(tx.issuedAt),
    kind,
  })
  if (match.kind !== "unique") return

  const other = match.match
  if (!other.accountId) return // defensive: partner should have an account_id
  if (kind === "outgoing") {
    await linkTransferPair({
      userId: tx.userId,
      outgoingId: tx.id,
      outgoingAccountId: tx.accountId,
      incomingId: other.id,
      incomingAccountId: other.accountId,
    })
  } else {
    await linkTransferPair({
      userId: tx.userId,
      outgoingId: other.id,
      outgoingAccountId: other.accountId,
      incomingId: tx.id,
      incomingAccountId: tx.accountId,
    })
  }
}

/**
 * Unlinks a transfer pair, clearing transfer_id / counter_account_id /
 * transfer_direction on both legs. Restores `type` from
 * `extra.preMigrationType` if present; otherwise defaults to 'other'.
 */
export async function unlinkTransfer(
  input: { userId: string; transferId: string },
): Promise<void> {
  const { userId, transferId } = input
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE transactions
         SET type = COALESCE(extra->>'preMigrationType', 'other'),
             transfer_id = NULL,
             counter_account_id = NULL,
             transfer_direction = NULL,
             extra = (extra - 'preMigrationType')
       WHERE transfer_id = $1 AND user_id = $2`,
      [transferId, userId],
    )
  })
}
