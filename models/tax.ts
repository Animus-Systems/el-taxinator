import { getPool } from "@/lib/pg"
import { cache } from "react"
import { listIncomeSources, sumPersonalIncome } from "@/models/income-sources"
import { sumDeductionsForYear } from "@/models/personal-deductions"

// ─── Tax period helpers ───────────────────────────────────────────────────────

export type Quarter = 1 | 2 | 3 | 4

export function getTaxPeriod(year: number, quarter: Quarter): { start: Date; end: Date } {
  const quarterStarts: Record<Quarter, number> = { 1: 0, 2: 3, 3: 6, 4: 9 }
  const quarterStart = quarterStarts[quarter]
  const start = new Date(year, quarterStart, 1)
  const end = new Date(year, quarterStart + 3, 0, 23, 59, 59, 999)
  return { start, end }
}

export function getQuarterLabel(quarter: Quarter, locale?: string): string {
  const esLabels: Record<Quarter, string> = {
    1: `Q1 (Ene–Mar)`,
    2: `Q2 (Abr–Jun)`,
    3: `Q3 (Jul–Sep)`,
    4: `Q4 (Oct–Dic)`,
  }
  const enLabels: Record<Quarter, string> = {
    1: `Q1 (Jan–Mar)`,
    2: `Q2 (Apr–Jun)`,
    3: `Q3 (Jul–Sep)`,
    4: `Q4 (Oct–Dec)`,
  }
  if (locale === "es") {
    return esLabels[quarter]
  }
  return enLabels[quarter]
}

/**
 * Filing deadlines for quarterly declarations.
 * Same for IGIC (ATC) and IRPF/IS (AEAT) in Canary Islands.
 */
export function getFilingDeadline(year: number, quarter: Quarter): Date {
  const deadlines: Record<Quarter, Date> = {
    1: new Date(year, 3, 20), // 20 April
    2: new Date(year, 6, 20), // 20 July
    3: new Date(year, 9, 20), // 20 October
    4: new Date(year + 1, 0, 30), // 30 January next year
  }
  return deadlines[quarter]
}

export function getUpcomingDeadlines(year: number, locale?: string) {
  return ([1, 2, 3, 4] as Quarter[]).map((q) => ({
    quarter: q,
    label: getQuarterLabel(q, locale),
    deadline: getFilingDeadline(year, q),
    forms: q === 4 ? ["420", "130", "425"] : ["420", "130"],
  }))
}

// ─── Shared tax query helpers ────────────────────────────────────────────────

/** Total revenue from sent/paid invoices in a date range. */
export async function queryInvoiceRevenue(pool: Awaited<ReturnType<typeof getPool>>, userId: string, start: Date, end: Date) {
  const result = await pool.query(
    `SELECT
       COALESCE(SUM(ii.quantity * ii.unit_price), 0)::float AS total_revenue,
       COUNT(DISTINCT i.id)::int AS invoice_count
     FROM invoices i
     JOIN invoice_items ii ON ii.invoice_id = i.id
     WHERE i.user_id = $1
       AND i.status IN ('sent', 'paid')
       AND i.issue_date >= $2
       AND i.issue_date <= $3`,
    [userId, start, end],
  )
  const row = result.rows[0]
  return {
    totalRevenue: typeof row?.["total_revenue"] === "number" ? row["total_revenue"] : 0,
    invoiceCount: typeof row?.["invoice_count"] === "number" ? row["invoice_count"] : 0,
  }
}

/** Total deductible expenses in a date range. Excludes rows marked
 * `personal_ignored`, `personal_taxable`, or `internal` — personal activity
 * (own-account transfers, mistaken deposits, crypto disposals, staking
 * rewards, FX conversions) must never leak into business expense totals
 * regardless of `type`. Personal taxable rows surface on Modelo 100 via the
 * FIFO ledger / category queries. Also defensively excludes
 * `type IN ('transfer', 'conversion')` (first-class non-business movements);
 * the outer `type = 'expense'` filter already rules them out, but the
 * redundant clause keeps the intent explicit and future-proof. */
export async function queryExpenses(pool: Awaited<ReturnType<typeof getPool>>, userId: string, start: Date, end: Date, requireConverted = false) {
  const result = await pool.query(
    `SELECT
       COALESCE(SUM(COALESCE(converted_total, total, 0)), 0)::float AS total_expenses,
       COUNT(*)::int AS expense_count
     FROM transactions
     WHERE user_id = $1
       AND type = 'expense'
       AND (status IS NULL OR status NOT IN ('personal_ignored', 'personal_taxable', 'internal'))
       AND (type IS NULL OR type NOT IN ('transfer', 'conversion'))
       AND issued_at >= $2
       AND issued_at <= $3
       ${requireConverted ? "AND converted_total IS NOT NULL" : ""}`,
    [userId, start, end],
  )
  const row = result.rows[0]
  return {
    totalExpenses: typeof row?.["total_expenses"] === "number" ? row["total_expenses"] : 0,
    expenseCount: typeof row?.["expense_count"] === "number" ? row["expense_count"] : 0,
  }
}

// ─── IGIC rates (Canary Islands) ─────────────────────────────────────────────
//
// IGIC replaces IVA/VAT in the Canary Islands. Administered by ATC.
//
// 0%   — tipo cero (basic food, medicine, water, education)
// 3%   — tipo reducido (industrial, agricultural, transport)
// 7%   — tipo general (default rate)
// 9.5% — tipo incrementado (vehicle/boat works)
// 15%  — tipo especial incrementado (luxury, alcohol, jewelry)
// 20%  — tipo especial (dark tobacco)
// 35%  — tipo especial (light tobacco)

const IGIC_GENERAL_RATE = 7

// ─── Modelo 420 — Quarterly IGIC return (Canary Islands) ────────────────────

export type Modelo420Result = {
  year: number
  quarter: Quarter
  period: { start: Date; end: Date }

  // IGIC devengado (output tax — charged to clients on invoices)
  baseZero: number
  cuotaZero: number
  baseReducido: number // 3%
  cuotaReducido: number
  baseGeneral: number // 7%
  cuotaGeneral: number
  baseIncrementado: number // 9.5%
  cuotaIncrementado: number
  baseEspecial: number // 15%+
  cuotaEspecial: number
  totalIgicDevengado: number

  // IGIC deducible (input tax — paid on deductible expenses)
  baseDeducible: number
  cuotaDeducible: number

  // Result
  resultado: number // Positive = pay, negative = compensate/refund
  invoiceCount: number
  expenseCount: number
}

export const calcModelo420 = cache(
  async (userId: string, year: number, quarter: Quarter): Promise<Modelo420Result> => {
    const pool = await getPool()
    const period = getTaxPeriod(year, quarter)

    // Aggregate IGIC bands from invoice items (unique to 420 — can't share with simple revenue query)
    const [igicResult, expenses, purchasesVat, allocatedRow] = await Promise.all([
      pool.query(
        `SELECT
           SUM(CASE WHEN ii.vat_rate = 0 OR ii.vat_rate IS NULL THEN ii.quantity * ii.unit_price ELSE 0 END)::float AS base_zero,
           0::float AS cuota_zero,
           SUM(CASE WHEN ii.vat_rate > 0 AND ii.vat_rate <= 3 THEN ii.quantity * ii.unit_price ELSE 0 END)::float AS base_reducido,
           SUM(CASE WHEN ii.vat_rate > 0 AND ii.vat_rate <= 3 THEN ii.quantity * ii.unit_price * (ii.vat_rate / 100.0) ELSE 0 END)::float AS cuota_reducido,
           SUM(CASE WHEN ii.vat_rate > 3 AND ii.vat_rate <= 7 THEN ii.quantity * ii.unit_price ELSE 0 END)::float AS base_general,
           SUM(CASE WHEN ii.vat_rate > 3 AND ii.vat_rate <= 7 THEN ii.quantity * ii.unit_price * (ii.vat_rate / 100.0) ELSE 0 END)::float AS cuota_general,
           SUM(CASE WHEN ii.vat_rate > 7 AND ii.vat_rate <= 9.5 THEN ii.quantity * ii.unit_price ELSE 0 END)::float AS base_incrementado,
           SUM(CASE WHEN ii.vat_rate > 7 AND ii.vat_rate <= 9.5 THEN ii.quantity * ii.unit_price * (ii.vat_rate / 100.0) ELSE 0 END)::float AS cuota_incrementado,
           SUM(CASE WHEN ii.vat_rate > 9.5 THEN ii.quantity * ii.unit_price ELSE 0 END)::float AS base_especial,
           SUM(CASE WHEN ii.vat_rate > 9.5 THEN ii.quantity * ii.unit_price * (ii.vat_rate / 100.0) ELSE 0 END)::float AS cuota_especial,
           COUNT(DISTINCT i.id)::int AS invoice_count
         FROM invoices i
         JOIN invoice_items ii ON ii.invoice_id = i.id
         WHERE i.user_id = $1
           AND i.status IN ('sent', 'paid')
           AND i.issue_date >= $2
           AND i.issue_date <= $3`,
        [userId, period.start, period.end],
      ),
      queryExpenses(pool, userId, period.start, period.end, true),
      // Input VAT from recorded supplier purchases in this period.
      // A purchase with itemised VAT is authoritative for its amount; for
      // expense transactions that are NOT covered by a purchase allocation
      // the rate-based estimate below still applies to whatever's left.
      pool.query(
        `SELECT
           COALESCE(SUM(pi.quantity * pi.unit_price), 0)::float AS base,
           COALESCE(SUM(pi.quantity * pi.unit_price * (pi.vat_rate / 100.0)), 0)::float AS cuota
         FROM purchases p
         JOIN purchase_items pi ON pi.purchase_id = p.id
         WHERE p.user_id = $1
           AND p.status != 'cancelled'
           AND p.issue_date >= $2
           AND p.issue_date <= $3`,
        [userId, period.start, period.end],
      ),
      // How much of the period's expense transactions is already covered by
      // a purchase_payments allocation — those cents must be excluded from
      // the rate-based estimate to avoid double-counting.
      pool.query(
        `SELECT COALESCE(SUM(pp.amount_cents), 0)::float AS allocated
         FROM purchase_payments pp
         JOIN transactions t ON t.id = pp.transaction_id
         WHERE pp.user_id = $1
           AND t.type = 'expense'
           AND t.issued_at >= $2
           AND t.issued_at <= $3`,
        [userId, period.start, period.end],
      ),
    ])

    const r = igicResult.rows[0]
    const num = (v: unknown): number => (typeof v === "number" ? v : 0)
    const baseZero = num(r?.["base_zero"])
    const cuotaZero = 0
    const baseReducido = num(r?.["base_reducido"])
    const cuotaReducido = num(r?.["cuota_reducido"])
    const baseGeneral = num(r?.["base_general"])
    const cuotaGeneral = num(r?.["cuota_general"])
    const baseIncrementado = num(r?.["base_incrementado"])
    const cuotaIncrementado = num(r?.["cuota_incrementado"])
    const baseEspecial = num(r?.["base_especial"])
    const cuotaEspecial = num(r?.["cuota_especial"])
    const invoiceCount = num(r?.["invoice_count"])

    const totalIgicDevengado = cuotaZero + cuotaReducido + cuotaGeneral + cuotaIncrementado + cuotaEspecial

    const { totalExpenses, expenseCount } = expenses

    // Itemised VAT from supplier purchases — authoritative for amounts covered.
    const purchasesBase = num(purchasesVat.rows[0]?.["base"])
    const purchasesCuota = num(purchasesVat.rows[0]?.["cuota"])
    const allocatedToPurchases = num(allocatedRow.rows[0]?.["allocated"])

    // Rate-based estimate applies only to the residual expense total not
    // covered by a recorded purchase allocation.
    const residualExpenses = Math.max(0, totalExpenses - allocatedToPurchases)
    const residualBase = Math.round(residualExpenses / (1 + IGIC_GENERAL_RATE / 100))
    const residualCuota = residualExpenses - residualBase

    const baseDeducible = Math.round(purchasesBase) + residualBase
    const cuotaDeducible = Math.round(purchasesCuota) + residualCuota

    const resultado = totalIgicDevengado - cuotaDeducible

    return {
      year,
      quarter,
      period,
      baseZero,
      cuotaZero,
      baseReducido,
      cuotaReducido: Math.round(cuotaReducido),
      baseGeneral,
      cuotaGeneral: Math.round(cuotaGeneral),
      baseIncrementado,
      cuotaIncrementado: Math.round(cuotaIncrementado),
      baseEspecial,
      cuotaEspecial: Math.round(cuotaEspecial),
      totalIgicDevengado: Math.round(totalIgicDevengado),
      baseDeducible,
      cuotaDeducible,
      resultado: Math.round(resultado),
      invoiceCount,
      expenseCount,
    }
  },
)

// ─── Modelo 130 — Quarterly IRPF installment (autónomos) ────────────────────
// Filed with AEAT. Same calculation for Canary Islands and mainland.

export type Modelo130Result = {
  year: number
  quarter: Quarter
  period: { start: Date; end: Date }

  casilla01_ingresos: number
  casilla02_gastos: number
  casilla03_rendimientoNeto: number
  casilla04_cuota20pct: number
  casilla05_irpfRetenido: number
  casilla06_aIngresar: number
  invoiceCount: number
  expenseCount: number
}

export const calcModelo130 = cache(
  async (userId: string, year: number, quarter: Quarter): Promise<Modelo130Result> => {
    const pool = await getPool()
    const period = getTaxPeriod(year, quarter)

    // Cumulative from start of year
    const cumulativeStart = new Date(year, 0, 1)
    const cumulativeEnd = period.end

    // Revenue query includes IRPF retention (unique to Modelo 130)
    const [invoiceResult, expenses] = await Promise.all([
      pool.query(
        `SELECT
           COALESCE(SUM(ii.quantity * ii.unit_price), 0)::float AS total_ingresos,
           COALESCE(SUM(
             CASE WHEN i.irpf_rate > 0
                  THEN ii.quantity * ii.unit_price * (i.irpf_rate / 100.0)
                  ELSE 0 END
           ), 0)::float AS total_irpf_retenido,
           COUNT(DISTINCT i.id)::int AS invoice_count
         FROM invoices i
         JOIN invoice_items ii ON ii.invoice_id = i.id
         WHERE i.user_id = $1
           AND i.status IN ('sent', 'paid')
           AND i.issue_date >= $2
           AND i.issue_date <= $3`,
        [userId, cumulativeStart, cumulativeEnd],
      ),
      queryExpenses(pool, userId, cumulativeStart, cumulativeEnd, true),
    ])

    const invoiceRow = invoiceResult.rows[0]
    const num = (v: unknown): number => (typeof v === "number" ? v : 0)
    const totalIngresos = num(invoiceRow?.["total_ingresos"])
    const totalIrpfRetenido = num(invoiceRow?.["total_irpf_retenido"])
    const invoiceCount = num(invoiceRow?.["invoice_count"])

    const totalGastos = expenses.totalExpenses
    const expenseCount = expenses.expenseCount
    const rendimientoNeto = Math.max(0, totalIngresos - totalGastos)
    const cuota = Math.round(rendimientoNeto * 0.2)
    const irpfRetenidoRounded = Math.round(totalIrpfRetenido)
    const aIngresar = Math.max(0, cuota - irpfRetenidoRounded)

    return {
      year,
      quarter,
      period,
      casilla01_ingresos: totalIngresos,
      casilla02_gastos: totalGastos,
      casilla03_rendimientoNeto: rendimientoNeto,
      casilla04_cuota20pct: cuota,
      casilla05_irpfRetenido: irpfRetenidoRounded,
      casilla06_aIngresar: aIngresar,
      invoiceCount,
      expenseCount,
    }
  },
)

// ─── Modelo 425 — Annual IGIC summary (Canary Islands) ─────────────────────

export type Modelo425Result = {
  year: number
  quarters: Modelo420Result[]
  totalBaseGeneral: number
  totalCuotaGeneral: number
  totalBaseReducido: number
  totalCuotaReducido: number
  totalIgicDevengado: number
  totalIgicDeducible: number
  totalResultado: number
}

export const calcModelo425 = cache(
  async (userId: string, year: number): Promise<Modelo425Result> => {
    const quarters = await Promise.all(
      ([1, 2, 3, 4] as Quarter[]).map((q) => calcModelo420(userId, year, q)),
    )

    return {
      year,
      quarters,
      totalBaseGeneral: quarters.reduce((s, q) => s + q.baseGeneral, 0),
      totalCuotaGeneral: quarters.reduce((s, q) => s + q.cuotaGeneral, 0),
      totalBaseReducido: quarters.reduce((s, q) => s + q.baseReducido, 0),
      totalCuotaReducido: quarters.reduce((s, q) => s + q.cuotaReducido, 0),
      totalIgicDevengado: quarters.reduce((s, q) => s + q.totalIgicDevengado, 0),
      totalIgicDeducible: quarters.reduce((s, q) => s + q.cuotaDeducible, 0),
      totalResultado: quarters.reduce((s, q) => s + q.resultado, 0),
    }
  },
)

// ─── Tax dashboard summary ────────────────────────────────────────────────────

export type QuarterlySummary = {
  quarter: Quarter
  label: string
  deadline: Date
  forms: string[]
  modelo420: Modelo420Result
  modelo130: Modelo130Result
}

export const getTaxYearSummary = cache(
  async (userId: string, year: number, locale?: string): Promise<QuarterlySummary[]> => {
    const deadlines = getUpcomingDeadlines(year, locale)

    const summaries = await Promise.all(
      deadlines.map(async ({ quarter, label, deadline, forms }) => {
        const [modelo420, modelo130] = await Promise.all([
          calcModelo420(userId, year, quarter),
          calcModelo130(userId, year, quarter),
        ])
        return { quarter, label, deadline, forms, modelo420, modelo130 }
      }),
    )

    return summaries
  },
)

// ─── Modelo 100 — Annual IRPF for autónomos (with base del ahorro) ─────────
//
// Phase 3 focuses on the crypto-relevant portion: capital gains on the base
// del ahorro (ganancia patrimonial from FIFO matches) and rendimiento del
// capital mobiliario (staking rewards). The business-income portion is a
// cumulative Jan 1–Dec 31 rendimiento neto derived from invoices and
// deductible expenses, matching the Modelo 130 methodology.

/**
 * 2026 "base del ahorro" progressive brackets. Amounts are in EUR cents.
 * Subject to annual law changes — knowledge pack carries the plain-language
 * description; this is the single source of truth for the calculator.
 */
const BASE_AHORRO_BRACKETS_2026: Array<{ upToCents: number; rate: number }> = [
  { upToCents: 600000, rate: 0.19 },
  { upToCents: 5000000, rate: 0.21 },
  { upToCents: 20000000, rate: 0.23 },
  { upToCents: 30000000, rate: 0.27 },
  { upToCents: Infinity, rate: 0.28 },
]

export type AhorroBracketBreakdown = {
  upToCents: number
  rate: number
  amountInBracketCents: number
  taxInBracketCents: number
}

/**
 * 2026 "base general" IRPF brackets — combined state + average autonomous
 * community portion. Used for employment, rental, and autónomo activity.
 * Individual autonomous communities vary; this is a reasonable default.
 */
const BASE_GENERAL_BRACKETS_2026: Array<{ upToCents: number; rate: number }> = [
  { upToCents: 1245000, rate: 0.19 },
  { upToCents: 2020000, rate: 0.24 },
  { upToCents: 3520000, rate: 0.30 },
  { upToCents: 6000000, rate: 0.37 },
  { upToCents: 30000000, rate: 0.45 },
  { upToCents: Infinity, rate: 0.47 },
]

/**
 * Apply the base-general progressive brackets to a positive amount (cents).
 * Same shape as applyBaseAhorroBrackets for consistent downstream use.
 */
export function applyBaseGeneralBrackets(
  baseCents: number,
  brackets: Array<{ upToCents: number; rate: number }> = BASE_GENERAL_BRACKETS_2026,
): { breakdown: AhorroBracketBreakdown[]; totalCuotaCents: number } {
  const breakdown: AhorroBracketBreakdown[] = []
  let remaining = Math.max(0, Math.round(baseCents))
  let previousCap = 0
  let totalCuotaCents = 0
  for (const b of brackets) {
    const bandSize = b.upToCents === Infinity ? remaining : Math.max(0, b.upToCents - previousCap)
    const amountInBracket = Math.min(Math.max(0, remaining), bandSize)
    const taxInBracket = Math.round(amountInBracket * b.rate)
    breakdown.push({
      upToCents: b.upToCents === Infinity ? Number.MAX_SAFE_INTEGER : b.upToCents,
      rate: b.rate,
      amountInBracketCents: amountInBracket,
      taxInBracketCents: taxInBracket,
    })
    totalCuotaCents += taxInBracket
    remaining -= amountInBracket
    previousCap = b.upToCents
  }
  return { breakdown, totalCuotaCents }
}

/**
 * Apply the base-del-ahorro progressive brackets to a positive amount (cents).
 * Returns both the per-bracket breakdown and the total cuota in cents.
 */
export function applyBaseAhorroBrackets(
  baseCents: number,
  brackets: Array<{ upToCents: number; rate: number }> = BASE_AHORRO_BRACKETS_2026,
): { breakdown: AhorroBracketBreakdown[]; totalCuotaCents: number } {
  const breakdown: AhorroBracketBreakdown[] = []
  let remaining = Math.max(0, Math.round(baseCents))
  let previousCap = 0
  let totalCuotaCents = 0
  // Walk every bracket so the breakdown is the full schedule — consumers can
  // display zero-amount bands without extra plumbing.
  for (const b of brackets) {
    const bandSize = b.upToCents === Infinity ? remaining : Math.max(0, b.upToCents - previousCap)
    const amountInBracket = Math.min(Math.max(0, remaining), bandSize)
    const taxInBracket = Math.round(amountInBracket * b.rate)
    breakdown.push({
      upToCents: b.upToCents === Infinity ? Number.MAX_SAFE_INTEGER : b.upToCents,
      rate: b.rate,
      amountInBracketCents: amountInBracket,
      taxInBracketCents: taxInBracket,
    })
    totalCuotaCents += taxInBracket
    remaining -= amountInBracket
    previousCap = b.upToCents
  }
  return { breakdown, totalCuotaCents }
}

export type Modelo100Result = {
  year: number
  // Business activity (cumulative annual)
  ingresosActividad: number
  gastosActividad: number
  rendimientoNetoActividad: number
  // Personal streams (all in cents)
  rendimientosTrabajo: number          // salary gross minus standard €2,000
  retencionesTrabajo: number           // IRPF withheld from payslips (credit)
  rendimientosCapitalInmobiliario: number  // rental income post 60% reduction
  // Base del ahorro components
  gananciasPatrimoniales: number       // realized gains (crypto + stocks combined)
  rendimientoCapitalMobiliario: number // staking, dividends, interest
  baseImponibleAhorro: number          // max(0, ganancias + rendimiento)
  cuotaAhorro: number
  ahorroBreakdown: AhorroBracketBreakdown[]
  // Base general components
  baseImponibleGeneral: number         // employment + rental + activity
  deduccionBaseCents: number           // pension reductions applied to base general
  baseLiquidableGeneral: number        // baseImponibleGeneral − deduccionBaseCents
  cuotaGeneral: number
  generalBreakdown: AhorroBracketBreakdown[]
  // Deductions credited against cuota (donations, mortgage, family, regional)
  deduccionCuotaCents: number
  // Final liability
  cuotaTotal: number                   // cuotaGeneral + cuotaAhorro − deduccionCuota
  cuotaDiferencial: number             // cuotaTotal − retencionesTrabajo
  // Untracked disposals (flagged so the user can fill cost basis)
  untrackedDisposalsCount: number
}

export const calcModelo100 = cache(
  async (userId: string, year: number): Promise<Modelo100Result> => {
    const pool = await getPool()
    const yearStart = new Date(year, 0, 1)
    const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999)

    const [invoiceResult, expenses, fifoRes, stakingRes, untrackedRes] = await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(ii.quantity * ii.unit_price), 0)::float AS total_ingresos
         FROM invoices i
         JOIN invoice_items ii ON ii.invoice_id = i.id
         WHERE i.user_id = $1
           AND i.status IN ('sent', 'paid')
           AND i.issue_date >= $2
           AND i.issue_date <= $3`,
        [userId, yearStart, yearEnd],
      ),
      queryExpenses(pool, userId, yearStart, yearEnd),
      pool.query(
        `SELECT COALESCE(SUM(realized_gain_cents), 0)::text AS total
         FROM crypto_disposal_matches
         WHERE user_id = $1
           AND EXTRACT(YEAR FROM matched_at) = $2`,
        [userId, year],
      ),
      pool.query(
        `SELECT COALESCE(SUM(COALESCE(converted_total, total, 0)), 0)::text AS total
         FROM transactions
         WHERE user_id = $1
           AND category_code = 'crypto_staking_reward'
           AND EXTRACT(YEAR FROM issued_at) = $2`,
        [userId, year],
      ),
      pool.query(
        `SELECT COUNT(*)::int AS n
         FROM transactions
         WHERE user_id = $1
           AND category_code = 'crypto_disposal'
           AND (extra ? 'crypto')
           AND (extra -> 'crypto' -> 'costBasisPerUnit' IS NULL
                OR extra -> 'crypto' ->> 'costBasisPerUnit' = '')
           AND EXTRACT(YEAR FROM issued_at) = $2`,
        [userId, year],
      ),
    ])

    const invoiceRow = invoiceResult.rows[0]
    const totalIngresosRaw = invoiceRow?.["total_ingresos"]
    const ingresosActividad = Math.round(typeof totalIngresosRaw === "number" ? totalIngresosRaw : 0)
    const gastosActividad = Math.round(expenses.totalExpenses)
    const rendimientoNetoActividad = Math.max(0, ingresosActividad - gastosActividad)

    const fifoRow = fifoRes.rows[0]
    const stakingRow = stakingRes.rows[0]
    const gananciasPatrimoniales = Number(fifoRow?.["total"] ?? 0)
    const rendimientoCapitalMobiliario = Number(stakingRow?.["total"] ?? 0)
    const baseImponibleAhorro = Math.max(
      0,
      gananciasPatrimoniales + rendimientoCapitalMobiliario,
    )
    const { breakdown, totalCuotaCents } = applyBaseAhorroBrackets(baseImponibleAhorro)

    // Personal streams: employment, rental, and deductions.
    const [salaryTotals, rentalProperties, deductionsTotals] = await Promise.all([
      sumPersonalIncome(userId, year, "salary"),
      listIncomeSources(userId, "rental"),
      sumDeductionsForYear(userId, year),
    ])

    // Employment: gross − standard €2,000 gastos deducibles (flat).
    const rendimientosTrabajo = Math.max(
      0,
      salaryTotals.grossCents - 200000,
    )
    const retencionesTrabajo = salaryTotals.withheldCents

    // Rental: sum rent deposits per property, apply 60% reduction for long-term.
    let rendimientosCapitalInmobiliario = 0
    if (rentalProperties.length > 0) {
      const propertyIds = rentalProperties.map((p) => p.id)
      const rentalIncomeResult = await pool.query(
        `SELECT t.income_source_id AS sid,
                COALESCE(SUM(t.total), 0) AS gross
         FROM transactions t
         WHERE t.user_id = $1
           AND t.income_source_id = ANY($2::uuid[])
           AND t.issued_at >= $3 AND t.issued_at <= $4
         GROUP BY t.income_source_id`,
        [userId, propertyIds, yearStart, yearEnd],
      )
      for (const row of rentalIncomeResult.rows) {
        const property = rentalProperties.find((p) => p.id === row["sid"])
        if (!property) continue
        const rentalType = (property.metadata as { rentalType?: string }).rentalType
        const gross = Number(row["gross"] ?? 0)
        const taxable = rentalType === "long" ? Math.round(gross * 0.4) : gross
        rendimientosCapitalInmobiliario += taxable
      }
    }

    const baseImponibleGeneral =
      rendimientoNetoActividad + rendimientosTrabajo + rendimientosCapitalInmobiliario
    const baseLiquidableGeneral = Math.max(
      0,
      baseImponibleGeneral - deductionsTotals.baseReductionCents,
    )
    const generalBrackets = applyBaseGeneralBrackets(baseLiquidableGeneral)
    const cuotaGeneral = generalBrackets.totalCuotaCents
    const cuotaTotal = Math.max(
      0,
      cuotaGeneral + totalCuotaCents - deductionsTotals.cuotaCreditCents,
    )
    const cuotaDiferencial = cuotaTotal - retencionesTrabajo

    return {
      year,
      ingresosActividad,
      gastosActividad,
      rendimientoNetoActividad,
      rendimientosTrabajo,
      retencionesTrabajo,
      rendimientosCapitalInmobiliario,
      gananciasPatrimoniales,
      rendimientoCapitalMobiliario,
      baseImponibleAhorro,
      cuotaAhorro: totalCuotaCents,
      ahorroBreakdown: breakdown,
      baseImponibleGeneral,
      deduccionBaseCents: deductionsTotals.baseReductionCents,
      baseLiquidableGeneral,
      cuotaGeneral,
      generalBreakdown: generalBrackets.breakdown,
      deduccionCuotaCents: deductionsTotals.cuotaCreditCents,
      cuotaTotal,
      cuotaDiferencial,
      untrackedDisposalsCount: Number(untrackedRes.rows[0]?.["n"] ?? 0),
    }
  },
)

// ─── Modelo 721 — Informativa for foreign crypto holdings ─────────────────
//
// If aggregate year-end value on foreign exchanges/wallets exceeds €50K
// (2026 threshold — may change), Modelo 721 must be filed between 1 Jan
// and 31 March of the following year. Filing is informational, no tax due.

const MODELO_721_THRESHOLD_CENTS_2026 = 5000000 // €50,000.00

export type Modelo721AssetRow = {
  asset: string
  quantity: string
  weightedAvgCostCents: number | null
  yearEndValueCents: number // best-effort from last known disposal price per asset
}

export type Modelo721Result = {
  year: number
  thresholdCents: number
  totalValueCents: number
  obligation: boolean
  deadline: Date
  assets: Modelo721AssetRow[]
}

export const calcModelo721 = cache(
  async (userId: string, year: number): Promise<Modelo721Result> => {
    const pool = await getPool()

    // Year-end snapshot: all lots with quantity remaining > 0 as of Dec 31.
    // For value we use (a) last disposal price per asset within the year, else
    // (b) the weighted avg cost — the user can override later via /settings.
    const lotsRes = await pool.query(
      `SELECT
         asset,
         COALESCE(SUM(quantity_remaining)::text, '0') AS total_quantity,
         CASE WHEN SUM(quantity_remaining) > 0
           THEN ROUND(SUM(quantity_remaining * cost_per_unit_cents) / SUM(quantity_remaining))::text
           ELSE NULL
         END AS weighted_avg_cost_cents
       FROM crypto_lots
       WHERE user_id = $1 AND quantity_remaining > 0
       GROUP BY asset`,
      [userId],
    )

    const priceRes = await pool.query(
      `SELECT DISTINCT ON (extra -> 'crypto' ->> 'asset')
         extra -> 'crypto' ->> 'asset' AS asset,
         (extra -> 'crypto' ->> 'pricePerUnit')::bigint AS price_cents
       FROM transactions
       WHERE user_id = $1
         AND category_code = 'crypto_disposal'
         AND (extra ? 'crypto')
         AND EXTRACT(YEAR FROM issued_at) = $2
         AND (extra -> 'crypto' ->> 'pricePerUnit') IS NOT NULL
       ORDER BY extra -> 'crypto' ->> 'asset',
                issued_at DESC`,
      [userId, year],
    )
    const latestPriceByAsset = new Map<string, number>()
    for (const r of priceRes.rows as Array<{ asset: string; price_cents: string | number }>) {
      latestPriceByAsset.set(r.asset, Number(r.price_cents))
    }

    const assets: Modelo721AssetRow[] = (
      lotsRes.rows as Array<{
        asset: string
        total_quantity: string
        weighted_avg_cost_cents: string | null
      }>
    ).map((r) => {
      const qty = Number(r.total_quantity)
      const avgCost = r.weighted_avg_cost_cents === null ? null : Number(r.weighted_avg_cost_cents)
      const referencePrice = latestPriceByAsset.get(r.asset) ?? avgCost ?? 0
      return {
        asset: r.asset,
        quantity: r.total_quantity,
        weightedAvgCostCents: avgCost,
        yearEndValueCents: Math.round(qty * referencePrice),
      }
    })

    const totalValueCents = assets.reduce((sum, a) => sum + a.yearEndValueCents, 0)
    return {
      year,
      thresholdCents: MODELO_721_THRESHOLD_CENTS_2026,
      totalValueCents,
      obligation: totalValueCents > MODELO_721_THRESHOLD_CENTS_2026,
      deadline: new Date(year + 1, 2, 31, 23, 59, 59, 999), // 31 March next year
      assets,
    }
  },
)
