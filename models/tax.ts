import { getPool } from "@/lib/pg"
import { cache } from "react"

// ─── Tax period helpers ───────────────────────────────────────────────────────

export type Quarter = 1 | 2 | 3 | 4

export function getTaxPeriod(year: number, quarter: Quarter): { start: Date; end: Date } {
  const quarterStart = [0, 3, 6, 9][quarter - 1]
  const start = new Date(year, quarterStart, 1)
  const end = new Date(year, quarterStart + 3, 0, 23, 59, 59, 999)
  return { start, end }
}

export function getQuarterLabel(quarter: Quarter, locale?: string): string {
  if (locale === "es") {
    return [`Q1 (Ene–Mar)`, `Q2 (Abr–Jun)`, `Q3 (Jul–Sep)`, `Q4 (Oct–Dic)`][quarter - 1]
  }
  return [`Q1 (Jan–Mar)`, `Q2 (Apr–Jun)`, `Q3 (Jul–Sep)`, `Q4 (Oct–Dec)`][quarter - 1]
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
  return {
    totalRevenue: (result.rows[0]?.total_revenue ?? 0) as number,
    invoiceCount: (result.rows[0]?.invoice_count ?? 0) as number,
  }
}

/** Total deductible expenses in a date range. */
export async function queryExpenses(pool: Awaited<ReturnType<typeof getPool>>, userId: string, start: Date, end: Date, requireConverted = false) {
  const result = await pool.query(
    `SELECT
       COALESCE(SUM(COALESCE(converted_total, total, 0)), 0)::float AS total_expenses,
       COUNT(*)::int AS expense_count
     FROM transactions
     WHERE user_id = $1
       AND type = 'expense'
       AND issued_at >= $2
       AND issued_at <= $3
       ${requireConverted ? "AND converted_total IS NOT NULL" : ""}`,
    [userId, start, end],
  )
  return {
    totalExpenses: (result.rows[0]?.total_expenses ?? 0) as number,
    expenseCount: (result.rows[0]?.expense_count ?? 0) as number,
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
    const [igicResult, expenses] = await Promise.all([
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
    ])

    const r = igicResult.rows[0]
    const baseZero = r?.base_zero ?? 0
    const cuotaZero = 0
    const baseReducido = r?.base_reducido ?? 0
    const cuotaReducido = r?.cuota_reducido ?? 0
    const baseGeneral = r?.base_general ?? 0
    const cuotaGeneral = r?.cuota_general ?? 0
    const baseIncrementado = r?.base_incrementado ?? 0
    const cuotaIncrementado = r?.cuota_incrementado ?? 0
    const baseEspecial = r?.base_especial ?? 0
    const cuotaEspecial = r?.cuota_especial ?? 0
    const invoiceCount = r?.invoice_count ?? 0

    const totalIgicDevengado = cuotaZero + cuotaReducido + cuotaGeneral + cuotaIncrementado + cuotaEspecial

    const { totalExpenses, expenseCount } = expenses

    // Estimate deductible IGIC: assume expenses are IGIC-inclusive at general rate (7%)
    const baseDeducible = Math.round(totalExpenses / (1 + IGIC_GENERAL_RATE / 100))
    const cuotaDeducible = totalExpenses - baseDeducible

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

    const totalIngresos = invoiceResult.rows[0]?.total_ingresos ?? 0
    const totalIrpfRetenido = invoiceResult.rows[0]?.total_irpf_retenido ?? 0
    const invoiceCount = invoiceResult.rows[0]?.invoice_count ?? 0

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
