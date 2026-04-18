/**
 * Convert the first sheet of an XLSX/XLS workbook to CSV text.
 *
 * Used by the import pipeline so a user can upload a spreadsheet and have it
 * treated as a CSV downstream (detect mapping → apply → categorize). The
 * conversion happens server-side to keep the browser bundle lean — the `xlsx`
 * package unpacks to ~7.6 MB on disk and ships ~900 KB minified for the
 * browser, which we'd rather not pay for when most users will only ever
 * upload CSV or PDF.
 */
import * as XLSX from "xlsx"

// Common header keywords that appear on the column-label row of bank / crypto
// statements. Used to skip preamble rows (address blocks, account metadata,
// balance summaries) that some exports put above the transaction table.
const HEADER_KEYWORDS = [
  "date", "time", "amount", "type", "currency", "description", "name",
  "merchant", "account", "reference", "note", "fee", "gross", "net",
  "code", "total", "credit", "debit", "payee", "balance", "transaction",
]

/**
 * Find the index of the first row that looks like the real column header.
 * Heuristic: the row must have at least 3 non-empty cells, at least 2 of
 * which contain a common header keyword (as whole word or substring), AND
 * the row that follows must have at least 2 non-empty cells (i.e. data is
 * present below). Returns 0 when nothing better is found so the caller falls
 * back to the default behavior.
 */
function findHeaderRow(rows: string[][]): number {
  const maxScan = Math.min(rows.length - 1, 40)
  for (let i = 0; i <= maxScan; i++) {
    const row = rows[i] ?? []
    const cells = row.map((c) => (c ?? "").toString().trim().toLowerCase()).filter((c) => c.length > 0)
    if (cells.length < 3) continue
    const headerHits = cells.filter((c) =>
      HEADER_KEYWORDS.some((kw) => c === kw || c.includes(kw)),
    ).length
    if (headerHits < 2) continue
    const next = rows[i + 1] ?? []
    const nextFilled = next.filter((c) => (c ?? "").toString().trim().length > 0).length
    if (nextFilled < 2) continue
    return i
  }
  return 0
}

export function xlsxBufferToCsv(buffer: Buffer | ArrayBuffer): string {
  const workbook = XLSX.read(buffer, { type: "buffer" })
  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) throw new Error("XLSX has no sheets")
  const sheet = workbook.Sheets[firstSheetName]
  if (!sheet) throw new Error("XLSX first sheet is empty")

  // Parse the whole sheet to an array-of-arrays so we can detect and skip
  // preamble rows (SwissBorg-style xlsx has ~10 rows of address/account info
  // before the real column headers).
  const aoa = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    blankrows: true,
    defval: "",
    raw: false,
  })
  const headerIdx = findHeaderRow(aoa as string[][])
  if (headerIdx === 0) {
    return XLSX.utils.sheet_to_csv(sheet)
  }
  const sliced = (aoa as string[][]).slice(headerIdx)
  const reSheet = XLSX.utils.aoa_to_sheet(sliced)
  return XLSX.utils.sheet_to_csv(reSheet)
}

/** Helper predicate used in multiple places when we only have a file name. */
export function isXlsxFileName(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.endsWith(".xlsx") || lower.endsWith(".xls")
}

/** Helper predicate used when we only have a MIME type (best-effort). */
export function isXlsxMimeType(mime: string | null | undefined): boolean {
  if (!mime) return false
  const lower = mime.toLowerCase()
  return (
    lower === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    lower === "application/vnd.ms-excel" ||
    lower === "application/x-excel" ||
    lower === "application/excel"
  )
}
