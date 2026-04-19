/**
 * Repair path for crypto transactions whose `extra.crypto` was never
 * populated at import time.
 *
 * The failure case we fix: an older build of the CSV column mapper didn't
 * know to map a crypto exchange's asset ticker / per-asset quantity / EUR
 * columns into structured metadata, so rows got categorised as `crypto_*`
 * correctly but `extra = {}` — leaving /crypto with nothing to aggregate
 * and the FIFO ledger unable to replay.
 *
 * This backfill reopens the original upload (which is still on disk,
 * linked via `import_sessions.file_id`), re-reads the XLSX/CSV with full
 * column awareness, then stamps each already-committed transaction with
 * the reconstructed `{ asset, quantity, pricePerUnit, feesCents }` and
 * triggers a FIFO replay so holdings and realised gains come back.
 */
import { readFile } from "node:fs/promises"
import * as XLSX from "xlsx"
import { getPool } from "@/lib/pg"
import { queryMany, sql } from "@/lib/sql"
import { fullPathForFile } from "@/lib/files"
import { getActiveEntityId } from "@/lib/entities"
import { getFileById } from "@/models/files"
import { isXlsxFileName, isXlsxMimeType } from "@/lib/xlsx-to-csv"
import { replayFromTransactions } from "@/models/crypto-fifo"
import type { TransactionCandidate } from "@/ai/import-csv"

export type BackfillResult = {
  sessionsScanned: number
  sessionsWithMissingFile: number
  candidatesConsidered: number
  transactionsUpdated: number
  transactionsSkipped: number
  fifoReplay: {
    lotsCreated: number
    disposalsMatched: number
    totalRealizedGainCents: number
  } | null
}

type SessionRow = {
  id: string
  fileId: string | null
  data: unknown
  columnMapping: unknown
}

// Column names we expect on a SwissBorg-style exchange export. When the
// column-mapping step left crypto fields unmapped, we fall back to these
// well-known SwissBorg header labels. Additional exchange variants can be
// added here over time.
const CRYPTO_HEADER_ALIASES = {
  asset: ["cryptoAsset", "Currency", "Asset", "Symbol", "Ticker"],
  quantity: ["cryptoQuantity", "Gross amount", "Amount", "Quantity"],
  grossEur: [
    "cryptoGrossAmountEur",
    "Gross amount (EUR)",
    "Value (EUR)",
    "Gross EUR",
  ],
  feeEur: ["cryptoFeeEur", "Fee (EUR)", "Fees (EUR)"],
}

function pickColumn(headers: string[], aliases: string[]): number {
  const lower = headers.map((h) => (h ?? "").toString().trim().toLowerCase())
  for (const alias of aliases) {
    const idx = lower.indexOf(alias.toLowerCase())
    if (idx !== -1) return idx
  }
  return -1
}

function parseQuantity(raw: string | undefined): number | null {
  if (!raw) return null
  const cleaned = raw.toString().replace(/,/g, ".").replace(/[^0-9.\-+]/g, "")
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function parseEurCents(raw: string | undefined): number | null {
  if (!raw) return null
  // European and US number formats collapse fine here — the file is
  // already normalised by the XLSX reader, so we only strip currency
  // symbols and convert to cents.
  const cleaned = raw.toString().replace(/[^0-9,.\-+]/g, "").trim()
  if (!cleaned) return null
  // SwissBorg uses "1,234.56" style; a bare "." is always decimal.
  const hasCommaDecimal = /\d,\d{1,2}$/.test(cleaned)
  const normalized = hasCommaDecimal
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned.replace(/,/g, "")
  const n = Number(normalized)
  if (!Number.isFinite(n)) return null
  return Math.round(Math.abs(n) * 100)
}

type SheetRow = string[]

function sheetRowsFromXlsxBuffer(buffer: Buffer): SheetRow[] {
  const wb = XLSX.read(buffer, { type: "buffer" })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) return []
  const sheet = wb.Sheets[sheetName]
  if (!sheet) return []
  const aoa = XLSX.utils.sheet_to_json<SheetRow>(sheet, {
    header: 1,
    blankrows: true,
    defval: "",
    raw: false,
  })
  return aoa
}

function findHeaderRow(rows: SheetRow[]): number {
  // Same heuristic as lib/xlsx-to-csv.ts — scan for a row with at least
  // three non-empty cells that look like column labels (contains one of
  // the well-known header keywords). SwissBorg exports have ~10 rows of
  // account metadata above the real header.
  const keywords = [
    "date", "time", "amount", "type", "currency", "description",
    "note", "fee", "gross", "net", "total",
  ]
  const maxScan = Math.min(rows.length - 1, 40)
  for (let i = 0; i <= maxScan; i++) {
    const row = rows[i] ?? []
    const cells = row.map((c) => (c ?? "").toString().trim().toLowerCase())
      .filter((c) => c.length > 0)
    if (cells.length < 3) continue
    const hits = cells.filter((c) =>
      keywords.some((kw) => c === kw || c.includes(kw)),
    ).length
    if (hits < 2) continue
    return i
  }
  return 0
}

/**
 * For a single session whose data candidates are missing extra.crypto on
 * the corresponding committed transactions, re-derive metadata from the
 * original upload and patch the transaction rows.
 */
async function backfillOneSession(
  userId: string,
  entityId: string,
  sessionRow: SessionRow,
  result: BackfillResult,
): Promise<void> {
  if (!sessionRow.fileId) return
  const file = await getFileById(sessionRow.fileId, userId)
  if (!file) {
    result.sessionsWithMissingFile += 1
    return
  }

  const isXlsx = isXlsxFileName(file.filename) || isXlsxMimeType(file.mimetype)
  const absolutePath = fullPathForFile(entityId, file)

  let buffer: Buffer
  try {
    buffer = await readFile(absolutePath)
  } catch {
    result.sessionsWithMissingFile += 1
    return
  }

  // Parse into a row matrix. For XLSX we re-run the header detection; for
  // CSV we read directly.
  const rows: SheetRow[] = isXlsx
    ? sheetRowsFromXlsxBuffer(buffer)
    : buffer.toString("utf-8").split(/\r?\n/).map((line) => line.split(","))

  if (rows.length === 0) return

  const headerRowIdx = findHeaderRow(rows)
  const headerRow = rows[headerRowIdx] ?? []
  const dataRows = rows.slice(headerRowIdx + 1)

  const assetIdx = pickColumn(headerRow, CRYPTO_HEADER_ALIASES.asset)
  const qtyIdx = pickColumn(headerRow, CRYPTO_HEADER_ALIASES.quantity)
  const grossIdx = pickColumn(headerRow, CRYPTO_HEADER_ALIASES.grossEur)
  const feeIdx = pickColumn(headerRow, CRYPTO_HEADER_ALIASES.feeEur)
  if (assetIdx === -1 || qtyIdx === -1) {
    // Not recognisable as a crypto-column-bearing file. Nothing to do.
    return
  }

  const candidates = Array.isArray(sessionRow.data)
    ? (sessionRow.data as TransactionCandidate[])
    : []

  const pool = await getPool()

  for (const candidate of candidates) {
    const code = candidate.categoryCode
    if (!code || !code.startsWith("crypto_")) continue
    result.candidatesConsidered += 1

    const rawRow = dataRows[candidate.rowIndex]
    if (!rawRow) {
      result.transactionsSkipped += 1
      continue
    }

    const assetRaw = rawRow[assetIdx]
    const qtyRaw = rawRow[qtyIdx]
    const grossRaw = grossIdx >= 0 ? rawRow[grossIdx] : undefined
    const feeRaw = feeIdx >= 0 ? rawRow[feeIdx] : undefined

    const assetStr = assetRaw ? assetRaw.toString().trim() : null
    const qtyNum = parseQuantity(qtyRaw)
    const grossEurCents = parseEurCents(grossRaw)
    const feeEurCents = parseEurCents(feeRaw)

    if (!assetStr || qtyNum === null || qtyNum <= 0) {
      result.transactionsSkipped += 1
      continue
    }

    const pricePerUnitCents =
      grossEurCents !== null ? Math.round(grossEurCents / qtyNum) : null

    // Purchases / airdrops need cost basis = price we paid (same as
    // pricePerUnit). Disposals leave costBasisPerUnit null so FIFO fills
    // it in from matched lots.
    const isAcquisition =
      code === "crypto_purchase" ||
      code === "crypto_airdrop" ||
      code === "crypto_staking_reward"

    const nextCrypto: Record<string, unknown> = {
      asset: assetStr.toUpperCase(),
      quantity: String(qtyNum),
    }
    if (pricePerUnitCents !== null) nextCrypto["pricePerUnit"] = pricePerUnitCents
    if (isAcquisition && pricePerUnitCents !== null) {
      nextCrypto["costBasisPerUnit"] = pricePerUnitCents
    }
    if (feeEurCents !== null) nextCrypto["feesCents"] = feeEurCents

    // Match on (user, category, same calendar day, same name, same total)
    // rather than exact timestamp. The commit pipeline shifts issued_at by
    // the server's local offset vs the "Time in UTC" string in the
    // candidate, so hour-level equality breaks across timezones. Name +
    // total + same day is unique enough per user per exchange.
    const issuedDate =
      typeof candidate.issuedAt === "string" ? candidate.issuedAt.slice(0, 10) : null
    if (!issuedDate || !candidate.name) {
      result.transactionsSkipped += 1
      continue
    }
    const updateRes = await pool.query(
      `UPDATE transactions t
          SET extra = COALESCE(t.extra, '{}'::jsonb) || jsonb_build_object('crypto', $5::jsonb),
              updated_at = now()
        WHERE t.user_id = $1
          AND t.category_code = $2
          AND DATE(t.issued_at) = $3::date
          AND t.total = $4
          AND t.name = $6
          AND (t.extra IS NULL OR NOT (t.extra ? 'crypto'))
        RETURNING t.id`,
      [
        userId,
        code,
        issuedDate,
        candidate.total,
        JSON.stringify(nextCrypto),
        candidate.name,
      ],
    )

    if ((updateRes.rowCount ?? 0) > 0) {
      result.transactionsUpdated += (updateRes.rowCount ?? 0)
    } else {
      result.transactionsSkipped += 1
    }
  }
}

/**
 * Public entry point. Finds every import session with a linked original
 * upload that still has crypto candidates on it whose committed
 * transactions are missing `extra.crypto`, patches them up, then replays
 * FIFO once at the end so holdings / realised gains stay consistent.
 */
export async function backfillCryptoMetadataFromImportFiles(
  userId: string,
  entityIdOverride?: string,
): Promise<BackfillResult> {
  const entityId = entityIdOverride ?? (await getActiveEntityId())
  const result: BackfillResult = {
    sessionsScanned: 0,
    sessionsWithMissingFile: 0,
    candidatesConsidered: 0,
    transactionsUpdated: 0,
    transactionsSkipped: 0,
    fifoReplay: null,
  }

  const sessions = await queryMany<SessionRow>(
    sql`
      SELECT id, file_id, data, column_mapping
      FROM import_sessions
      WHERE user_id = ${userId}
        AND file_id IS NOT NULL
        AND status = 'committed'
        AND (
          data @> '[{"categoryCode":"crypto_disposal"}]'::jsonb
          OR data @> '[{"categoryCode":"crypto_purchase"}]'::jsonb
          OR data @> '[{"categoryCode":"crypto_airdrop"}]'::jsonb
          OR data @> '[{"categoryCode":"crypto_staking_reward"}]'::jsonb
          OR data @> '[{"categoryCode":"crypto_fee"}]'::jsonb
        )
      ORDER BY created_at ASC
    `,
  )

  for (const s of sessions) {
    result.sessionsScanned += 1
    try {
      await backfillOneSession(userId, entityId, s, result)
    } catch (err) {
      console.warn(
        "[crypto-backfill] session failed:",
        s.id,
        err instanceof Error ? err.message : err,
      )
    }
  }

  if (result.transactionsUpdated > 0) {
    result.fifoReplay = await replayFromTransactions(userId)
  }

  return result
}
