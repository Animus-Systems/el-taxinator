import { prisma } from "@/lib/db"
import { cache } from "react"

// ─── Tax period helpers ───────────────────────────────────────────────────────

export type Quarter = 1 | 2 | 3 | 4

export function getTaxPeriod(year: number, quarter: Quarter): { start: Date; end: Date } {
  const quarterStart = [0, 3, 6, 9][quarter - 1]
  const start = new Date(year, quarterStart, 1)
  const end = new Date(year, quarterStart + 3, 0, 23, 59, 59, 999)
  return { start, end }
}

export function getQuarterLabel(quarter: Quarter): string {
  return [`Q1 (Ene–Mar)`, `Q2 (Abr–Jun)`, `Q3 (Jul–Sep)`, `Q4 (Oct–Dic)`][quarter - 1]
}

/**
 * Returns the filing deadline for a given year and quarter.
 * Q1: 20 April, Q2: 20 July, Q3: 20 October, Q4: 30 January (next year)
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

export function getUpcomingDeadlines(year: number) {
  return ([1, 2, 3, 4] as Quarter[]).map((q) => ({
    quarter: q,
    label: getQuarterLabel(q),
    deadline: getFilingDeadline(year, q),
    forms: q === 4 ? ["303", "130", "390"] : ["303", "130"],
  }))
}

// ─── Modelo 303 — Quarterly VAT return ───────────────────────────────────────

export type Modelo303Result = {
  year: number
  quarter: Quarter
  period: { start: Date; end: Date }

  // IVA repercutido (VAT charged to clients, from invoices)
  casilla01_baseGeneral: number // Base imponible 21%
  casilla03_cuotaGeneral: number // VAT collected at 21%
  casilla06_baseReducido: number // Base imponible 10%
  casilla07_cuotaReducido: number // VAT collected at 10%
  casilla09_baseSuperReducido: number // Base imponible 4%
  casilla11_cuotaSuperReducido: number // VAT collected at 4%
  totalIvaRepercutido: number

  // IVA soportado (VAT paid on deductible expenses, from transactions)
  casilla28_baseDeducible: number
  casilla29_cuotaDeducible: number

  // Result
  casilla46_resultado: number // Positive = pay, negative = refund
  invoiceCount: number
  expenseCount: number
}

export const calcModelo303 = cache(async (userId: string, year: number, quarter: Quarter): Promise<Modelo303Result> => {
  const period = getTaxPeriod(year, quarter)

  // Get sent/paid invoices in the period
  const invoices = await prisma.invoice.findMany({
    where: {
      userId,
      status: { in: ["sent", "paid"] },
      issueDate: { gte: period.start, lte: period.end },
    },
    include: { items: true },
  })

  // Group invoice items by VAT rate band
  let base21 = 0,
    vat21 = 0,
    base10 = 0,
    vat10 = 0,
    base4 = 0,
    vat4 = 0

  for (const invoice of invoices) {
    for (const item of invoice.items) {
      const base = item.quantity * item.unitPrice // in cents
      const vat = base * (item.vatRate / 100)
      if (item.vatRate >= 20) {
        base21 += base
        vat21 += vat
      } else if (item.vatRate >= 8) {
        base10 += base
        vat10 += vat
      } else if (item.vatRate > 0) {
        base4 += base
        vat4 += vat
      }
      // vatRate === 0 items are exempt
    }
  }

  const totalIvaRepercutido = vat21 + vat10 + vat4

  // Get expense transactions in the period (for IVA soportado)
  // We estimate deductible VAT as 21% of expense totals — users should refine this
  const expenses = await prisma.transaction.findMany({
    where: {
      userId,
      type: "expense",
      issuedAt: { gte: period.start, lte: period.end },
      convertedTotal: { not: null },
    },
  })

  const totalExpenses = expenses.reduce((sum, t) => sum + (t.convertedTotal ?? t.total ?? 0), 0)
  // Estimate: assume expenses are VAT-inclusive at 21%. Deductible VAT = total × (21/121)
  // This is an approximation — a full implementation would track VAT per expense
  const estimatedVatBase = Math.round(totalExpenses / 1.21)
  const estimatedVatDeductible = totalExpenses - estimatedVatBase

  const resultado = totalIvaRepercutido - estimatedVatDeductible

  return {
    year,
    quarter,
    period,
    casilla01_baseGeneral: base21,
    casilla03_cuotaGeneral: Math.round(vat21),
    casilla06_baseReducido: base10,
    casilla07_cuotaReducido: Math.round(vat10),
    casilla09_baseSuperReducido: base4,
    casilla11_cuotaSuperReducido: Math.round(vat4),
    totalIvaRepercutido: Math.round(totalIvaRepercutido),
    casilla28_baseDeducible: estimatedVatBase,
    casilla29_cuotaDeducible: estimatedVatDeductible,
    casilla46_resultado: Math.round(resultado),
    invoiceCount: invoices.length,
    expenseCount: expenses.length,
  }
})

// ─── Modelo 130 — Quarterly IRPF installment (autónomos) ────────────────────

export type Modelo130Result = {
  year: number
  quarter: Quarter
  period: { start: Date; end: Date }

  casilla01_ingresos: number // Invoice subtotals (excl. VAT), sent/paid
  casilla02_gastos: number // Expense transactions total
  casilla03_rendimientoNeto: number // ingresos - gastos
  casilla04_cuota20pct: number // 20% × rendimientoNeto (if positive)
  casilla05_irpfRetenido: number // IRPF already withheld by clients on invoices
  casilla06_aIngresar: number // cuota20pct - irpfRetenido (min 0)
  invoiceCount: number
  expenseCount: number
}

export const calcModelo130 = cache(async (userId: string, year: number, quarter: Quarter): Promise<Modelo130Result> => {
  const period = getTaxPeriod(year, quarter)

  // Cumulative: Modelo 130 uses cumulative figures from start of year to end of quarter
  const cumulativePeriod = {
    start: new Date(year, 0, 1),
    end: period.end,
  }

  const invoices = await prisma.invoice.findMany({
    where: {
      userId,
      status: { in: ["sent", "paid"] },
      issueDate: { gte: cumulativePeriod.start, lte: cumulativePeriod.end },
    },
    include: { items: true },
  })

  // Sum invoice subtotals (base imponible, excl. VAT) and IRPF withheld
  let totalIngresos = 0
  let totalIrpfRetenido = 0

  for (const invoice of invoices) {
    const subtotal = invoice.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
    totalIngresos += subtotal
    if (invoice.irpfRate > 0) {
      totalIrpfRetenido += subtotal * (invoice.irpfRate / 100)
    }
  }

  const expenses = await prisma.transaction.findMany({
    where: {
      userId,
      type: "expense",
      issuedAt: { gte: cumulativePeriod.start, lte: cumulativePeriod.end },
      convertedTotal: { not: null },
    },
  })

  const totalGastos = expenses.reduce((sum, t) => sum + (t.convertedTotal ?? t.total ?? 0), 0)
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
    invoiceCount: invoices.length,
    expenseCount: expenses.length,
  }
})

// ─── Modelo 390 — Annual VAT summary ─────────────────────────────────────────

export type Modelo390Result = {
  year: number
  quarters: Modelo303Result[]
  totalBaseGeneral: number
  totalCuotaGeneral: number
  totalBaseReducido: number
  totalCuotaReducido: number
  totalIvaRepercutido: number
  totalIvaDeducible: number
  totalResultado: number // positive = total paid, negative = total refund
}

export const calcModelo390 = cache(async (userId: string, year: number): Promise<Modelo390Result> => {
  const quarters = await Promise.all(
    ([1, 2, 3, 4] as Quarter[]).map((q) => calcModelo303(userId, year, q))
  )

  return {
    year,
    quarters,
    totalBaseGeneral: quarters.reduce((s, q) => s + q.casilla01_baseGeneral, 0),
    totalCuotaGeneral: quarters.reduce((s, q) => s + q.casilla03_cuotaGeneral, 0),
    totalBaseReducido: quarters.reduce((s, q) => s + q.casilla06_baseReducido, 0),
    totalCuotaReducido: quarters.reduce((s, q) => s + q.casilla07_cuotaReducido, 0),
    totalIvaRepercutido: quarters.reduce((s, q) => s + q.totalIvaRepercutido, 0),
    totalIvaDeducible: quarters.reduce((s, q) => s + q.casilla29_cuotaDeducible, 0),
    totalResultado: quarters.reduce((s, q) => s + q.casilla46_resultado, 0),
  }
})

// ─── Tax dashboard summary ────────────────────────────────────────────────────

export type QuarterlySummary = {
  quarter: Quarter
  label: string
  deadline: Date
  forms: string[]
  modelo303: Modelo303Result
  modelo130: Modelo130Result
}

export const getTaxYearSummary = cache(async (userId: string, year: number): Promise<QuarterlySummary[]> => {
  const deadlines = getUpcomingDeadlines(year)

  const summaries = await Promise.all(
    deadlines.map(async ({ quarter, label, deadline, forms }) => {
      const [modelo303, modelo130] = await Promise.all([
        calcModelo303(userId, year, quarter),
        calcModelo130(userId, year, quarter),
      ])
      return { quarter, label, deadline, forms, modelo303, modelo130 }
    })
  )

  return summaries
})
