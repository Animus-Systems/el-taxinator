/**
 * One-shot runner for the crypto metadata backfill.
 *
 * Standalone — uses a direct pg.Client against the user-supplied runtime.json
 * so it doesn't collide with the dev-server's embedded cluster lock.
 *
 * Usage:
 *   tsx scripts/run-crypto-backfill.ts <entityId> <userId>
 *
 * Entity data dir resolves via $TAXINATOR_DATA_DIR/<entityId> (default `./data`).
 * Reads runtime.json for port+password, then applies the same algorithm as
 * `models/crypto-backfill.ts` directly through pg.Client.
 */
import { readFile } from "node:fs/promises"
import path from "node:path"
import pg from "pg"
import * as XLSX from "xlsx"

type SessionRow = {
  id: string
  file_id: string
  data: unknown
}

type FileRow = {
  id: string
  filename: string
  mimetype: string
  path: string
}

const CRYPTO_HEADER_ALIASES = {
  asset: ["cryptoAsset", "Currency", "Asset", "Symbol", "Ticker"],
  quantity: ["cryptoQuantity", "Gross amount", "Amount", "Quantity"],
  grossEur: ["cryptoGrossAmountEur", "Gross amount (EUR)", "Value (EUR)", "Gross EUR"],
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
  const cleaned = raw.toString().replace(/[^0-9,.\-+]/g, "").trim()
  if (!cleaned) return null
  const hasCommaDecimal = /\d,\d{1,2}$/.test(cleaned)
  const normalized = hasCommaDecimal
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned.replace(/,/g, "")
  const n = Number(normalized)
  if (!Number.isFinite(n)) return null
  return Math.round(Math.abs(n) * 100)
}

function findHeaderRow(rows: string[][]): number {
  const keywords = ["date", "time", "amount", "type", "currency", "description", "note", "fee", "gross", "net", "total"]
  const maxScan = Math.min(rows.length - 1, 40)
  for (let i = 0; i <= maxScan; i++) {
    const row = rows[i] ?? []
    const cells = row
      .map((c) => (c ?? "").toString().trim().toLowerCase())
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

function isXlsx(file: FileRow): boolean {
  const lower = file.filename.toLowerCase()
  return (
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls") ||
    file.mimetype.includes("spreadsheetml") ||
    file.mimetype.includes("ms-excel")
  )
}

async function main(): Promise<void> {
  const entityId = process.argv[2]
  const userId = process.argv[3]
  if (!entityId || !userId) {
    console.error("Usage: tsx scripts/run-crypto-backfill.ts <entityId> <userId>")
    process.exit(1)
  }

  const dataDir = process.env["TAXINATOR_DATA_DIR"] ?? path.join(process.cwd(), "data")
  const entityDir = path.join(dataDir, entityId)
  const uploadsDir = path.join(entityDir, "uploads")
  // runtime.json gets re-written on every server start, so prefer
  // TAXINATOR_PG_PORT / TAXINATOR_PG_PASSWORD env overrides when the dev
  // server is already running (they match the live socket).
  const envPort = process.env["TAXINATOR_PG_PORT"]
  const envPassword = process.env["TAXINATOR_PG_PASSWORD"]
  const runtime = envPort && envPassword
    ? { port: Number(envPort), password: envPassword }
    : (JSON.parse(await readFile(path.join(entityDir, "runtime.json"), "utf-8")) as {
        port: number
        password: string
      })

  const client = new pg.Client({
    connectionString: `postgres://taxinator:${encodeURIComponent(
      runtime.password,
    )}@127.0.0.1:${runtime.port}/taxinator`,
  })
  await client.connect()

  const sessionsRes = await client.query<SessionRow>(
    `SELECT id, file_id, data
       FROM import_sessions
      WHERE user_id = $1
        AND file_id IS NOT NULL
        AND status = 'committed'
        AND (
          data @> '[{"categoryCode":"crypto_disposal"}]'::jsonb
          OR data @> '[{"categoryCode":"crypto_purchase"}]'::jsonb
          OR data @> '[{"categoryCode":"crypto_airdrop"}]'::jsonb
          OR data @> '[{"categoryCode":"crypto_staking_reward"}]'::jsonb
          OR data @> '[{"categoryCode":"crypto_fee"}]'::jsonb
        )
      ORDER BY created_at ASC`,
    [userId],
  )

  const result = {
    sessionsScanned: 0,
    sessionsWithMissingFile: 0,
    candidatesConsidered: 0,
    transactionsUpdated: 0,
    transactionsSkipped: 0,
  }

  for (const s of sessionsRes.rows) {
    result.sessionsScanned += 1

    const fileRes = await client.query<FileRow>(
      `SELECT id, filename, mimetype, path FROM files WHERE id = $1 AND user_id = $2`,
      [s.file_id, userId],
    )
    const file = fileRes.rows[0]
    if (!file) {
      result.sessionsWithMissingFile += 1
      continue
    }
    const absPath = path.join(uploadsDir, file.path)
    let buffer: Buffer
    try {
      buffer = await readFile(absPath)
    } catch {
      result.sessionsWithMissingFile += 1
      continue
    }

    let rows: string[][] = []
    if (isXlsx(file)) {
      const wb = XLSX.read(buffer, { type: "buffer" })
      const sheetName = wb.SheetNames[0]
      if (!sheetName) continue
      const sheet = wb.Sheets[sheetName]
      if (!sheet) continue
      rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
        header: 1,
        blankrows: true,
        defval: "",
        raw: false,
      })
    } else {
      rows = buffer.toString("utf-8").split(/\r?\n/).map((line) => line.split(","))
    }

    if (rows.length === 0) continue
    const headerIdx = findHeaderRow(rows)
    const headerRow = rows[headerIdx] ?? []
    const dataRows = rows.slice(headerIdx + 1)

    const assetIdx = pickColumn(headerRow, CRYPTO_HEADER_ALIASES.asset)
    const qtyIdx = pickColumn(headerRow, CRYPTO_HEADER_ALIASES.quantity)
    const grossIdx = pickColumn(headerRow, CRYPTO_HEADER_ALIASES.grossEur)
    const feeIdx = pickColumn(headerRow, CRYPTO_HEADER_ALIASES.feeEur)
    if (assetIdx === -1 || qtyIdx === -1) continue

    const candidates = Array.isArray(s.data) ? (s.data as Array<Record<string, unknown>>) : []
    for (const c of candidates) {
      const code = c["categoryCode"] as string | null
      if (!code || !code.startsWith("crypto_")) continue
      result.candidatesConsidered += 1

      const rowIndex = c["rowIndex"] as number
      const rawRow = dataRows[rowIndex]
      if (!rawRow) {
        result.transactionsSkipped += 1
        continue
      }

      const assetStr = rawRow[assetIdx] ? rawRow[assetIdx]!.toString().trim() : null
      const qtyNum = parseQuantity(rawRow[qtyIdx])
      const grossEurCents = grossIdx >= 0 ? parseEurCents(rawRow[grossIdx]) : null
      const feeEurCents = feeIdx >= 0 ? parseEurCents(rawRow[feeIdx]) : null

      if (!assetStr || qtyNum === null || qtyNum <= 0) {
        result.transactionsSkipped += 1
        continue
      }

      const pricePerUnitCents = grossEurCents !== null ? Math.round(grossEurCents / qtyNum) : null
      const isAcquisition = code === "crypto_purchase" || code === "crypto_airdrop" || code === "crypto_staking_reward"

      const nextCrypto: Record<string, unknown> = { asset: assetStr.toUpperCase(), quantity: String(qtyNum) }
      if (pricePerUnitCents !== null) nextCrypto["pricePerUnit"] = pricePerUnitCents
      if (isAcquisition && pricePerUnitCents !== null) nextCrypto["costBasisPerUnit"] = pricePerUnitCents
      if (feeEurCents !== null) nextCrypto["feesCents"] = feeEurCents

      // Match on (user, category, same calendar day, same name, same total).
      // Avoids timestamp-level matching which breaks because the commit path
      // shifts issued_at by the server's local offset vs the "Time in UTC"
      // string in the candidate. Name + total + day is unique enough for a
      // given SwissBorg account.
      const issuedAtStr = c["issuedAt"] as string | null
      const issuedDate = issuedAtStr ? issuedAtStr.slice(0, 10) : null
      const updated = await client.query(
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
          c["total"],
          JSON.stringify(nextCrypto),
          c["name"] ?? null,
        ],
      )

      if ((updated.rowCount ?? 0) > 0) {
        result.transactionsUpdated += updated.rowCount ?? 0
      } else {
        result.transactionsSkipped += 1
      }
    }
  }

  await client.end()
  console.log(JSON.stringify(result, null, 2))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
