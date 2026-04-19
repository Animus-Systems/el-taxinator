import { sumPersonalIncome } from "./income-sources"
import { sumDeductionsForYear } from "./personal-deductions"
import { getPool } from "@/lib/pg"

/**
 * Simplified Modelo 100 (IRPF) estimate.
 *
 * NOT a substitute for real tax software — the Spanish IRPF is progressive
 * with regional variations per autonomous community, several special regimes,
 * and deductions that interact in non-trivial ways. This gives a ballpark so
 * the user knows roughly what Modelo 100 will look like.
 *
 * Approximations:
 * - Combined state + autonomous-community rates (averaged). Actual rate
 *   varies ±2pp depending on where the user is resident.
 * - Pension contribution reduction capped at €1,500 (2024+ limit).
 * - Personal/family minimum not modelled (treats the €5,550 personal minimum
 *   as already implicit in the bracket starts — close enough for estimates).
 * - Rental income treated as gross, no 60% reduction for long-term leases
 *   (that's an easy future improvement).
 * - Crypto uses realized gains (FIFO) as of snapshot time.
 */

type Bracket = { limitCents: number; ratePct: number }

/**
 * Combined state + average autonomous-community rates for the general base.
 * Values approximate the 2024–2025 aggregate (e.g. Madrid lower, Cataluña
 * higher) — picked for reasonable ballpark accuracy.
 */
const GENERAL_BRACKETS: Bracket[] = [
  { limitCents: 1_245_000, ratePct: 19 },
  { limitCents: 2_020_000, ratePct: 24 },
  { limitCents: 3_520_000, ratePct: 30 },
  { limitCents: 6_000_000, ratePct: 37 },
  { limitCents: 30_000_000, ratePct: 45 },
  { limitCents: Number.MAX_SAFE_INTEGER, ratePct: 47 },
]

/**
 * Savings base (rentas del ahorro) — 2024 rates. Mostly state-defined so no
 * material regional variation.
 */
const SAVINGS_BRACKETS: Bracket[] = [
  { limitCents: 600_000, ratePct: 19 },
  { limitCents: 5_000_000, ratePct: 21 },
  { limitCents: 20_000_000, ratePct: 23 },
  { limitCents: 30_000_000, ratePct: 27 },
  { limitCents: Number.MAX_SAFE_INTEGER, ratePct: 28 },
]

export function computeProgressiveTax(baseCents: number, brackets: Bracket[]): number {
  if (baseCents <= 0) return 0
  let tax = 0
  let remaining = baseCents
  let previousLimit = 0
  for (const bracket of brackets) {
    if (remaining <= 0) break
    const bandWidth = bracket.limitCents - previousLimit
    const inThisBand = Math.min(remaining, bandWidth)
    tax += Math.round((inThisBand * bracket.ratePct) / 100)
    remaining -= inThisBand
    previousLimit = bracket.limitCents
  }
  return tax
}

export type PersonalTaxEstimate = {
  year: number
  salaryGrossCents: number
  salaryWithheldCents: number
  rentalGrossCents: number
  dividendGrossCents: number
  dividendWithheldCents: number
  interestGrossCents: number
  interestWithheldCents: number
  cryptoRealizedGainCents: number
  deductionBaseReductionCents: number
  deductionCuotaCreditCents: number
  generalBaseCents: number
  savingsBaseCents: number
  generalCuotaCents: number
  savingsCuotaCents: number
  cuotaIntegraCents: number
  cuotaLiquidaCents: number
  totalWithheldCents: number
  /** Positive = owed to treasury; negative = refund. */
  resultCents: number
}

/**
 * Pull realized crypto gains for a year directly from the DB rather than via
 * the tRPC caller (the estimate runs from tax-estimate.ts, which is a plain
 * model module). Replicates the aggregation used by cryptoRouter.summary.
 */
async function sumCryptoRealizedGainCents(userId: string, year: number): Promise<number> {
  const pool = await getPool()
  const start = new Date(Date.UTC(year, 0, 1))
  const end = new Date(Date.UTC(year + 1, 0, 1))
  const result = await pool.query(
    `SELECT COALESCE(SUM((extra->'crypto'->>'realizedGainCents')::bigint), 0) AS gain_cents
     FROM transactions
     WHERE user_id = $1
       AND issued_at >= $2 AND issued_at < $3
       AND extra->'crypto' IS NOT NULL`,
    [userId, start, end],
  )
  const row = result.rows[0] ?? {}
  return Number(row["gain_cents"] ?? 0)
}

export async function computePersonalTaxEstimate(
  userId: string,
  year: number,
): Promise<PersonalTaxEstimate> {
  const [salary, rental, dividend, interest, deductions, cryptoGains] = await Promise.all([
    sumPersonalIncome(userId, year, "salary"),
    sumPersonalIncome(userId, year, "rental"),
    sumPersonalIncome(userId, year, "dividend"),
    sumPersonalIncome(userId, year, "interest"),
    sumDeductionsForYear(userId, year),
    sumCryptoRealizedGainCents(userId, year),
  ])

  const generalBaseCents = Math.max(
    0,
    salary.grossCents + rental.grossCents - deductions.baseReductionCents,
  )
  const savingsBaseCents = Math.max(
    0,
    dividend.grossCents + interest.grossCents + cryptoGains,
  )

  const generalCuotaCents = computeProgressiveTax(generalBaseCents, GENERAL_BRACKETS)
  const savingsCuotaCents = computeProgressiveTax(savingsBaseCents, SAVINGS_BRACKETS)
  const cuotaIntegraCents = generalCuotaCents + savingsCuotaCents
  const cuotaLiquidaCents = Math.max(0, cuotaIntegraCents - deductions.cuotaCreditCents)
  const totalWithheldCents =
    salary.withheldCents + dividend.withheldCents + interest.withheldCents
  const resultCents = cuotaLiquidaCents - totalWithheldCents

  return {
    year,
    salaryGrossCents: salary.grossCents,
    salaryWithheldCents: salary.withheldCents,
    rentalGrossCents: rental.grossCents,
    dividendGrossCents: dividend.grossCents,
    dividendWithheldCents: dividend.withheldCents,
    interestGrossCents: interest.grossCents,
    interestWithheldCents: interest.withheldCents,
    cryptoRealizedGainCents: cryptoGains,
    deductionBaseReductionCents: deductions.baseReductionCents,
    deductionCuotaCreditCents: deductions.cuotaCreditCents,
    generalBaseCents,
    savingsBaseCents,
    generalCuotaCents,
    savingsCuotaCents,
    cuotaIntegraCents,
    cuotaLiquidaCents,
    totalWithheldCents,
    resultCents,
  }
}
