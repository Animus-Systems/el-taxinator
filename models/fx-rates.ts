import { getPool } from "@/lib/pg"
import { sql, queryOne, execute } from "@/lib/sql"

/**
 * European Central Bank daily reference rates. The FX block on non-EUR
 * invoices quotes these as the authoritative source. Rates are public —
 * this cache is shared across all users.
 */

const ECB_90D_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml"
const ECB_HIST_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml"
// Attribution shown in the PDF. Display-friendly trailing slash so the user's
// expected format ("https://www.ecb.europa.eu") renders verbatim.
const ECB_ATTRIBUTION = "https://www.ecb.europa.eu"

const MS_PER_DAY = 86_400_000
const CACHE_TOLERANCE_DAYS = 7
const RECENT_DATE_DAYS = 85

type CachedRow = {
  rateDate: Date
  currency: string
  eurPerUnit: string | number
}

/**
 * Look up the EUR-per-unit rate for `currency` on (or just before) `onDate`.
 * Returns null when the currency is EUR, not in ECB's list, or the fetch
 * fails — callers should treat a null return as "skip the FX block".
 */
export async function getEurPerUnit(
  currency: string,
  onDate: Date,
): Promise<{ eurPerUnit: string; effectiveDate: Date; source: string } | null> {
  const code = currency.trim().toUpperCase()
  if (!code || code === "EUR") return null

  const cached = await findCached(code, onDate)
  if (cached) {
    return {
      eurPerUnit: String(cached.eurPerUnit),
      effectiveDate: new Date(cached.rateDate),
      source: ECB_ATTRIBUTION,
    }
  }

  const feedUrl = isWithinRecentWindow(onDate) ? ECB_90D_URL : ECB_HIST_URL
  const xml = await fetchEcbXml(feedUrl)
  if (!xml) return null

  const entries = parseEcbXml(xml)
  if (entries.length === 0) return null
  await upsertRates(entries)

  const fresh = await findCached(code, onDate)
  if (!fresh) return null
  return {
    eurPerUnit: String(fresh.eurPerUnit),
    effectiveDate: new Date(fresh.rateDate),
    source: ECB_ATTRIBUTION,
  }
}

function isWithinRecentWindow(onDate: Date): boolean {
  const diffMs = Date.now() - onDate.getTime()
  return diffMs <= RECENT_DATE_DAYS * MS_PER_DAY
}

async function findCached(
  currency: string,
  onDate: Date,
): Promise<CachedRow | null> {
  const minDateMs = onDate.getTime() - CACHE_TOLERANCE_DAYS * MS_PER_DAY
  const minDate = new Date(minDateMs)
  return queryOne<CachedRow>(sql`
    SELECT rate_date, currency, eur_per_unit
    FROM fx_rates
    WHERE currency = ${currency}
      AND rate_date <= ${onDate}
      AND rate_date >= ${minDate}
    ORDER BY rate_date DESC
    LIMIT 1`)
}

async function fetchEcbXml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return await res.text()
  } catch (err) {
    console.warn("[fx-rates] ECB fetch failed:", err instanceof Error ? err.message : err)
    return null
  }
}

type EcbEntry = { date: string; currency: string; eurPerUnit: string }

/**
 * Extract (date, currency, rate) triples from the ECB envelope. The format is
 * simple enough that a hand-rolled regex parser avoids adding an XML library
 * for this single use case.
 */
export function parseEcbXml(xml: string): EcbEntry[] {
  const entries: EcbEntry[] = []
  const dayRegex = /<Cube\s+time="([^"]+)"[^>]*>([\s\S]*?)<\/Cube>/g
  const rateRegex = /<Cube\s+currency="([^"]+)"\s+rate="([^"]+)"\s*\/>/g
  let dayMatch: RegExpExecArray | null
  while ((dayMatch = dayRegex.exec(xml)) !== null) {
    const date = dayMatch[1]
    const inner = dayMatch[2]
    if (!date || !inner) continue
    let rateMatch: RegExpExecArray | null
    rateRegex.lastIndex = 0
    while ((rateMatch = rateRegex.exec(inner)) !== null) {
      const code = rateMatch[1]
      const raw = rateMatch[2]
      if (!code || !raw) continue
      const rate = Number(raw)
      if (!Number.isFinite(rate) || rate <= 0) continue
      // ECB publishes foreign-per-EUR. Store EUR-per-unit — the display form.
      // Fixed-precision string avoids exponent notation when inverting very
      // large or small rates (e.g. HUF, JPY).
      const eurPerUnit = (1 / rate).toFixed(10)
      entries.push({ date, currency: code.toUpperCase(), eurPerUnit })
    }
  }
  return entries
}

async function upsertRates(entries: EcbEntry[]): Promise<void> {
  if (entries.length === 0) return
  // Batch by building a single multi-row INSERT. ON CONFLICT DO NOTHING so
  // parallel fetches racing to populate the cache don't fight each other.
  const values: string[] = []
  const params: unknown[] = []
  entries.forEach((e, i) => {
    const base = i * 3
    values.push(`($${base + 1}, $${base + 2}, $${base + 3})`)
    params.push(e.date, e.currency, e.eurPerUnit)
  })
  const pool = await getPool()
  await pool.query(
    `INSERT INTO fx_rates (rate_date, currency, eur_per_unit)
     VALUES ${values.join(", ")}
     ON CONFLICT (rate_date, currency) DO NOTHING`,
    params,
  )
}

// `execute` is re-exported for test ergonomics — callers that want to
// pre-seed the cache in integration tests can use it directly.
export { execute }
