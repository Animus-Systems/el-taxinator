import { getPool } from "@/lib/pg"
import { cache } from "react"
import { getTaxPeriod, Quarter, calcModelo420, getQuarterLabel, getFilingDeadline, getUpcomingDeadlines, queryInvoiceRevenue, queryExpenses, type Modelo420Result } from "./tax"

// ─── Modelo 202 — Quarterly corporate tax installment (SL) ──────────────────

export type Modelo202Result = {
  year: number
  quarter: Quarter
  period: { start: Date; end: Date }

  // Revenue and expenses for the period
  casilla01_baseImponible: number // Net profit (revenue - expenses)
  casilla02_tipoGravamen: number // Corporate tax rate (usually 25%, 15% for new companies)
  casilla03_cuotaIntegra: number // baseImponible * tipoGravamen
  casilla04_pagosACuenta: number // Previous quarterly payments this year
  casilla05_aIngresar: number // Amount to pay this quarter

  invoiceCount: number
  expenseCount: number
}

/**
 * Compute a single quarter's Modelo 202 given known previous payments.
 * Non-recursive — the caller provides pagosACuenta from prior quarters.
 */
async function calcModelo202ForQuarter(
  userId: string,
  year: number,
  quarter: Quarter,
  taxRate: number,
  pagosACuenta: number,
): Promise<Modelo202Result> {
  const pool = await getPool()
  const period = getTaxPeriod(year, quarter)
  const cumulativeStart = new Date(year, 0, 1)
  const cumulativeEnd = period.end

  const [revenue, expenses] = await Promise.all([
    queryInvoiceRevenue(pool, userId, cumulativeStart, cumulativeEnd),
    queryExpenses(pool, userId, cumulativeStart, cumulativeEnd),
  ])

  const { totalRevenue, invoiceCount } = revenue
  const { totalExpenses, expenseCount } = expenses

  const baseImponible = Math.max(0, totalRevenue - totalExpenses)
  const cuotaIntegra = Math.round(baseImponible * (taxRate / 100))
  const aIngresar = Math.max(0, cuotaIntegra - pagosACuenta)

  return {
    year,
    quarter,
    period,
    casilla01_baseImponible: baseImponible,
    casilla02_tipoGravamen: taxRate,
    casilla03_cuotaIntegra: cuotaIntegra,
    casilla04_pagosACuenta: pagosACuenta,
    casilla05_aIngresar: aIngresar,
    invoiceCount,
    expenseCount,
  }
}

/**
 * Public API: computes Modelo 202 for a given quarter, iteratively calculating
 * all prior quarters Q1→Q(n-1) to determine pagosACuenta.
 * Safe to call outside React cache() context — no recursion.
 */
export const calcModelo202 = cache(
  async (
    userId: string,
    year: number,
    quarter: Quarter,
    taxRate: number = 25,
  ): Promise<Modelo202Result> => {
    let pagosACuenta = 0
    for (let q = 1; q < quarter; q++) {
      const prev = await calcModelo202ForQuarter(userId, year, q as Quarter, taxRate, pagosACuenta)
      pagosACuenta += prev.casilla05_aIngresar
    }
    return calcModelo202ForQuarter(userId, year, quarter, taxRate, pagosACuenta)
  },
)

// ─── Modelo 200 — Annual corporate tax return (SL) ──────────────────────────

export type Modelo200Result = {
  year: number
  quarters: Modelo202Result[]

  totalRevenue: number
  totalExpenses: number
  baseImponible: number
  tipoGravamen: number
  cuotaIntegra: number
  totalPagosACuenta: number // Sum of quarterly Modelo 202 payments
  cuotaDiferencial: number // Final balance: positive = pay more, negative = refund
}

export const calcModelo200 = cache(
  async (userId: string, year: number, taxRate: number = 25): Promise<Modelo200Result> => {
    const pool = await getPool()

    // Calculate all four quarters
    const quarters = await Promise.all(
      ([1, 2, 3, 4] as Quarter[]).map((q) => calcModelo202(userId, year, q, taxRate)),
    )

    // Full-year revenue and expenses
    const yearStart = new Date(year, 0, 1)
    const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999)

    const [revenue, expenses] = await Promise.all([
      queryInvoiceRevenue(pool, userId, yearStart, yearEnd),
      queryExpenses(pool, userId, yearStart, yearEnd),
    ])

    const { totalRevenue } = revenue
    const { totalExpenses } = expenses
    const baseImponible = Math.max(0, totalRevenue - totalExpenses)
    const cuotaIntegra = Math.round(baseImponible * (taxRate / 100))
    const totalPagosACuenta = quarters.reduce((s, q) => s + q.casilla05_aIngresar, 0)
    const cuotaDiferencial = cuotaIntegra - totalPagosACuenta

    return {
      year,
      quarters,
      totalRevenue,
      totalExpenses,
      baseImponible,
      tipoGravamen: taxRate,
      cuotaIntegra,
      totalPagosACuenta,
      cuotaDiferencial,
    }
  },
)

// ─── SL Tax dashboard summary ────────────────────────────────────────────────

export type SLQuarterlySummary = {
  quarter: Quarter
  label: string
  deadline: Date
  forms: string[]
  modelo420: Modelo420Result
  modelo202: Modelo202Result
}

export const getSLTaxYearSummary = cache(
  async (userId: string, year: number, locale?: string, taxRate: number = 25): Promise<SLQuarterlySummary[]> => {
    const deadlines = getUpcomingDeadlines(year, locale)

    const summaries = await Promise.all(
      deadlines.map(async ({ quarter, label, deadline }) => {
        const forms = quarter === 4 ? ["420", "202", "200"] : ["420", "202"]
        const [modelo420, modelo202] = await Promise.all([
          calcModelo420(userId, year, quarter),
          calcModelo202(userId, year, quarter, taxRate),
        ])
        return { quarter, label, deadline, forms, modelo420, modelo202 }
      }),
    )

    return summaries
  },
)
