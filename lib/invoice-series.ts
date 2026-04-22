/**
 * Spanish invoice numbering comes in "series" — every issuer must assign a
 * non-skipping correlative number within each series (AEAT audits for gaps,
 * see RD 1619/2012 art. 6 and 7). A series is everything before the trailing
 * integer: `F-2026-0003` → series "F-2026-", ord 3. This module extracts the
 * series + ordinal and finds missing integers so the UI can flag them.
 *
 * Design notes:
 *  - Only the *trailing* run of digits counts as the ordinal. Embedded years
 *    ("F2026-0003") stay inside the series key, so F2026 and F2025 are treated
 *    as different series — which is what you want: each calendar year is its
 *    own legally-independent sequence.
 *  - Padding (F-0001 vs F-1) is preserved in the formatted gap labels so the
 *    suggestion reads the same way as the surrounding rows.
 *  - Numbers with no trailing digits are skipped (no ordinal to compare).
 */

export type ParsedNumber = {
  /** Raw text before the trailing digits (can be empty). */
  series: string
  /** Numeric value of the trailing run. */
  ord: number
  /** Number of digits in the trailing run — preserved for padded formatting. */
  padding: number
}

const TRAILING_DIGITS_RE = /^(.*?)(\d+)$/

export function parseInvoiceNumber(raw: string): ParsedNumber | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const match = TRAILING_DIGITS_RE.exec(trimmed)
  if (!match) return null
  const [, prefix, digits] = match
  if (!digits) return null
  const ord = Number.parseInt(digits, 10)
  if (!Number.isFinite(ord)) return null
  return { series: prefix ?? "", ord, padding: digits.length }
}

export function formatNumberInSeries(series: string, ord: number, padding: number): string {
  return `${series}${String(ord).padStart(padding, "0")}`
}

export type SeriesGap = {
  /** Prefix shared by the rows, e.g. "F-2026-". */
  series: string
  /** Ordinal that should exist but doesn't. */
  ord: number
  /** Human-readable reconstructed number: "F-2026-0007". */
  label: string
}

/**
 * Find every integer missing between the min and max ord of each series, given
 * a bag of invoice numbers. Detects nothing if a series has fewer than two
 * ordinals (can't distinguish "gap" from "just hasn't been issued yet").
 */
export function detectSeriesGaps(numbers: readonly string[]): SeriesGap[] {
  const bySeries = new Map<string, { ords: Set<number>; padding: number }>()
  for (const raw of numbers) {
    const parsed = parseInvoiceNumber(raw)
    if (!parsed) continue
    const entry = bySeries.get(parsed.series) ?? { ords: new Set<number>(), padding: parsed.padding }
    entry.ords.add(parsed.ord)
    // Keep the widest padding seen so gap labels match the most-padded rows.
    entry.padding = Math.max(entry.padding, parsed.padding)
    bySeries.set(parsed.series, entry)
  }

  const gaps: SeriesGap[] = []
  for (const [series, { ords, padding }] of bySeries) {
    if (ords.size < 2) continue
    let min = Number.POSITIVE_INFINITY
    let max = Number.NEGATIVE_INFINITY
    for (const n of ords) {
      if (n < min) min = n
      if (n > max) max = n
    }
    for (let n = min + 1; n < max; n++) {
      if (!ords.has(n)) {
        gaps.push({ series, ord: n, label: formatNumberInSeries(series, n, padding) })
      }
    }
  }
  return gaps.sort((a, b) => (a.series === b.series ? a.ord - b.ord : a.series.localeCompare(b.series)))
}

export type InvoiceNumberRow = {
  number: string
  createdAt: Date
}

/**
 * Suggest the next invoice number based on existing rows. Picks the series
 * whose most recent row is newest (ties broken by higher max ord), then
 * returns max(ord) + 1 padded to the widest padding seen in that series.
 * Gaps are ignored — accounting convention keeps gaps as gaps. Falls back to
 * the caller-supplied string when nothing parses.
 */
export function suggestNextInvoiceNumber(
  existing: readonly InvoiceNumberRow[],
  fallback: string,
): string {
  type SeriesStats = {
    series: string
    maxOrd: number
    padding: number
    mostRecent: number
  }
  const bySeries = new Map<string, SeriesStats>()
  for (const row of existing) {
    const parsed = parseInvoiceNumber(row.number)
    if (!parsed) continue
    const createdAtMs = row.createdAt.getTime()
    const entry = bySeries.get(parsed.series)
    if (!entry) {
      bySeries.set(parsed.series, {
        series: parsed.series,
        maxOrd: parsed.ord,
        padding: parsed.padding,
        mostRecent: createdAtMs,
      })
      continue
    }
    if (parsed.ord > entry.maxOrd) entry.maxOrd = parsed.ord
    if (parsed.padding > entry.padding) entry.padding = parsed.padding
    if (createdAtMs > entry.mostRecent) entry.mostRecent = createdAtMs
  }

  if (bySeries.size === 0) return fallback

  let winner: SeriesStats | null = null
  for (const stats of bySeries.values()) {
    if (!winner) {
      winner = stats
      continue
    }
    if (stats.mostRecent > winner.mostRecent) {
      winner = stats
    } else if (stats.mostRecent === winner.mostRecent && stats.maxOrd > winner.maxOrd) {
      winner = stats
    }
  }
  if (!winner) return fallback
  return formatNumberInSeries(winner.series, winner.maxOrd + 1, winner.padding)
}
