import { getPool } from "@/lib/pg"
import { mapRow } from "@/lib/sql"
import { getLocalizedValue } from "@/lib/i18n-db"
import type { Category } from "@/lib/db-types"
import { cache } from "react"
import { TransactionFilters, buildTransactionWhere } from "./transactions"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DashboardStats = {
  totalIncomePerCurrency: Record<string, number>
  totalExpensesPerCurrency: Record<string, number>
  profitPerCurrency: Record<string, number>
  invoicesProcessed: number
}

export type ProjectStats = {
  totalIncomePerCurrency: Record<string, number>
  totalExpensesPerCurrency: Record<string, number>
  profitPerCurrency: Record<string, number>
  invoicesProcessed: number
}

export type TimeSeriesData = {
  period: string
  income: number
  expenses: number
  date: Date
}

export type CategoryBreakdown = {
  code: string
  name: string
  color: string
  income: number
  expenses: number
  transactionCount: number
}

export type DetailedTimeSeriesData = {
  period: string
  income: number
  expenses: number
  date: Date
  categories: CategoryBreakdown[]
  totalTransactions: number
}

export type MerchantBreakdown = {
  merchant: string
  expenses: number
  transactionCount: number
}

export type ProfitTrendPoint = {
  period: string
  profit: number
  date: Date
}

export type DashboardAnalytics = {
  timeSeries: TimeSeriesData[]
  categoryBreakdown: Array<{
    code: string
    name: string
    color: string
    expenses: number
    transactionCount: number
  }>
  topMerchants: MerchantBreakdown[]
  profitTrend: ProfitTrendPoint[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convenience wrapper: builds WHERE for stats queries (no table alias, no search). */
function buildStatsWhere(
  userId: string,
  filters: TransactionFilters = {},
  extraConditions?: string[],
): { clause: string; values: unknown[] } {
  const { clause, values } = buildTransactionWhere(userId, filters, {
    alias: "",
    ...(extraConditions !== undefined ? { extraConditions } : {}),
  })
  return { clause, values }
}

/**
 * Aggregates totals per currency via SQL SUM/GROUP BY.
 * Uses converted_total + converted_currency_code when available, else total + currency_code.
 */
async function aggregatePerCurrency(
  userId: string,
  type: string,
  filters: TransactionFilters = {},
  extraConditions?: string[],
): Promise<Record<string, number>> {
  const pool = await getPool()
  const { clause, values } = buildStatsWhere(userId, filters, extraConditions)
  const typeIdx = values.length + 1
  values.push(type)

  const result = await pool.query(
    `SELECT
       UPPER(COALESCE(converted_currency_code, currency_code)) AS currency,
       SUM(COALESCE(
         CASE WHEN converted_currency_code IS NOT NULL THEN converted_total END,
         total,
         0
       ))::float AS total
     FROM transactions
     ${clause} AND type = $${typeIdx}
     GROUP BY UPPER(COALESCE(converted_currency_code, currency_code))`,
    values,
  )

  const map: Record<string, number> = {}
  for (const row of result.rows) {
    const currency = row["currency"] as string | null | undefined
    if (currency) {
      map[currency] = (row["total"] as number | null | undefined) ?? 0
    }
  }
  return map
}

// ---------------------------------------------------------------------------
// Dashboard stats (SQL aggregation)
// ---------------------------------------------------------------------------

export const getDashboardStats = cache(
  async (userId: string, filters: TransactionFilters = {}): Promise<DashboardStats> => {
    const pool = await getPool()
    const { clause, values } = buildStatsWhere(userId, filters)

    const [totalIncomePerCurrency, totalExpensesPerCurrency, countResult] = await Promise.all([
      aggregatePerCurrency(userId, "income", filters),
      aggregatePerCurrency(userId, "expense", filters),
      pool.query(`SELECT COUNT(*)::int AS count FROM transactions ${clause}`, values),
    ])

    // Compute profit
    const allCurrencies = new Set([
      ...Object.keys(totalIncomePerCurrency),
      ...Object.keys(totalExpensesPerCurrency),
    ])
    const profitPerCurrency: Record<string, number> = {}
    for (const currency of allCurrencies) {
      profitPerCurrency[currency] =
        (totalIncomePerCurrency[currency] ?? 0) - (totalExpensesPerCurrency[currency] ?? 0)
    }

    return {
      totalIncomePerCurrency,
      totalExpensesPerCurrency,
      profitPerCurrency,
      invoicesProcessed: (countResult.rows[0]?.["count"] as number | undefined) ?? 0,
    }
  },
)

// ---------------------------------------------------------------------------
// Project stats (SQL aggregation)
// ---------------------------------------------------------------------------

export const getProjectStats = cache(
  async (
    userId: string,
    projectId: string,
    filters: TransactionFilters = {},
  ): Promise<ProjectStats> => {
    const pool = await getPool()
    const projectFilters = { ...filters, projectCode: projectId }
    const { clause, values } = buildStatsWhere(userId, projectFilters)

    const [totalIncomePerCurrency, totalExpensesPerCurrency, countResult] = await Promise.all([
      aggregatePerCurrency(userId, "income", projectFilters),
      aggregatePerCurrency(userId, "expense", projectFilters),
      pool.query(`SELECT COUNT(*)::int AS count FROM transactions ${clause}`, values),
    ])

    const allCurrencies = new Set([
      ...Object.keys(totalIncomePerCurrency),
      ...Object.keys(totalExpensesPerCurrency),
    ])
    const profitPerCurrency: Record<string, number> = {}
    for (const currency of allCurrencies) {
      profitPerCurrency[currency] =
        (totalIncomePerCurrency[currency] ?? 0) - (totalExpensesPerCurrency[currency] ?? 0)
    }

    return {
      totalIncomePerCurrency,
      totalExpensesPerCurrency,
      profitPerCurrency,
      invoicesProcessed: (countResult.rows[0]?.["count"] as number | undefined) ?? 0,
    }
  },
)

// ---------------------------------------------------------------------------
// Time series stats
// ---------------------------------------------------------------------------

export const getTimeSeriesStats = cache(
  async (
    userId: string,
    filters: TransactionFilters = {},
    defaultCurrency: string = "EUR",
  ): Promise<TimeSeriesData[]> => {
    const pool = await getPool()
    const { clause, values } = buildStatsWhere(userId, filters)

    // First determine date range and whether to group by day or month
    const rangeResult = await pool.query(
      `SELECT MIN(issued_at) AS min_date, MAX(issued_at) AS max_date
       FROM transactions ${clause} AND issued_at IS NOT NULL`,
      values,
    )

    const rangeRow = rangeResult.rows[0]
    if (!rangeRow?.["min_date"]) return []

    const dateFrom = filters.dateFrom
      ? new Date(filters.dateFrom)
      : new Date(rangeRow["min_date"] as string | Date)
    const dateTo = filters.dateTo
      ? new Date(filters.dateTo)
      : new Date(rangeRow["max_date"] as string | Date)
    const daysDiff = Math.ceil((dateTo.getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24))
    const groupByDay = daysDiff <= 50

    const periodExpr = groupByDay
      ? `TO_CHAR(issued_at, 'YYYY-MM-DD')`
      : `TO_CHAR(issued_at, 'YYYY-MM')`

    const upperCurrency = defaultCurrency.toUpperCase()
    const currIdx = values.length + 1
    values.push(upperCurrency)

    const result = await pool.query(
      `SELECT
         ${periodExpr} AS period,
         MIN(issued_at) AS period_date,
         SUM(CASE WHEN type = 'income' THEN
           CASE
             WHEN UPPER(converted_currency_code) = $${currIdx} THEN COALESCE(converted_total, 0)
             WHEN UPPER(currency_code) = $${currIdx} THEN COALESCE(total, 0)
             ELSE 0
           END ELSE 0 END)::float AS income,
         SUM(CASE WHEN type = 'expense' THEN
           CASE
             WHEN UPPER(converted_currency_code) = $${currIdx} THEN COALESCE(converted_total, 0)
             WHEN UPPER(currency_code) = $${currIdx} THEN COALESCE(total, 0)
             ELSE 0
           END ELSE 0 END)::float AS expenses
       FROM transactions
       ${clause} AND issued_at IS NOT NULL
       GROUP BY ${periodExpr}
       ORDER BY ${periodExpr} ASC`,
      values,
    )

    return result.rows.map((row) => ({
      period: row["period"] as string,
      income: (row["income"] as number | null | undefined) ?? 0,
      expenses: (row["expenses"] as number | null | undefined) ?? 0,
      date: new Date(row["period_date"] as string | Date),
    }))
  },
)

// ---------------------------------------------------------------------------
// Dashboard analytics
// ---------------------------------------------------------------------------

export const getDashboardAnalytics = cache(
  async (
    userId: string,
    filters: TransactionFilters = {},
    defaultCurrency: string = "EUR",
  ): Promise<DashboardAnalytics> => {
    const pool = await getPool()
    const upperCurrency = defaultCurrency.toUpperCase()
    const { clause, values, nextIdx } = buildTransactionWhere(userId, filters, {
      alias: "t",
      extraConditions: ["t.issued_at IS NOT NULL"],
    })

    const dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : null
    const dateTo = filters.dateTo ? new Date(filters.dateTo) : null
    const daysDiff =
      dateFrom && dateTo
        ? Math.ceil((dateTo.getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24))
        : Number.POSITIVE_INFINITY
    const groupByDay = daysDiff <= 50

    const periodExpr = groupByDay
      ? `TO_CHAR(t.issued_at, 'YYYY-MM-DD')`
      : `TO_CHAR(t.issued_at, 'YYYY-MM')`

    const currencyIdx = nextIdx
    const analyticsValues = [...values, upperCurrency]

    const timeSeriesResult = await pool.query(
      `SELECT
         ${periodExpr} AS period,
         MIN(t.issued_at) AS period_date,
         SUM(CASE WHEN t.type = 'income' THEN
           CASE
             WHEN UPPER(t.converted_currency_code) = $${currencyIdx} THEN COALESCE(t.converted_total, 0)
             WHEN UPPER(t.currency_code) = $${currencyIdx} THEN COALESCE(t.total, 0)
             ELSE 0
           END ELSE 0 END)::float AS income,
         SUM(CASE WHEN t.type = 'expense' THEN
           CASE
             WHEN UPPER(t.converted_currency_code) = $${currencyIdx} THEN COALESCE(t.converted_total, 0)
             WHEN UPPER(t.currency_code) = $${currencyIdx} THEN COALESCE(t.total, 0)
             ELSE 0
           END ELSE 0 END)::float AS expenses
       FROM transactions t
       ${clause}
       GROUP BY ${periodExpr}
       ORDER BY ${periodExpr} ASC`,
      analyticsValues,
    )

    const categoryResult = await pool.query(
      `SELECT
         COALESCE(c.code, 'other') AS code,
         COALESCE(c.name, 'Other') AS name,
         COALESCE(c.color, '#6b7280') AS color,
         SUM(
           CASE
             WHEN UPPER(t.converted_currency_code) = $${currencyIdx} THEN COALESCE(t.converted_total, 0)
             WHEN UPPER(t.currency_code) = $${currencyIdx} THEN COALESCE(t.total, 0)
             ELSE 0
           END
         )::float AS expenses,
         COUNT(*)::int AS transaction_count
       FROM transactions t
       LEFT JOIN categories c ON c.code = t.category_code AND c.user_id = t.user_id
       ${clause} AND t.type = 'expense'
       GROUP BY COALESCE(c.code, 'other'), COALESCE(c.name, 'Other'), COALESCE(c.color, '#6b7280')
       ORDER BY expenses DESC`,
      analyticsValues,
    )

    const merchantResult = await pool.query(
      `SELECT
         COALESCE(NULLIF(TRIM(t.merchant), ''), NULLIF(TRIM(t.name), ''), 'Unknown') AS merchant,
         SUM(
           CASE
             WHEN UPPER(t.converted_currency_code) = $${currencyIdx} THEN COALESCE(t.converted_total, 0)
             WHEN UPPER(t.currency_code) = $${currencyIdx} THEN COALESCE(t.total, 0)
             ELSE 0
           END
         )::float AS expenses,
         COUNT(*)::int AS transaction_count
       FROM transactions t
       ${clause} AND t.type = 'expense'
       GROUP BY COALESCE(NULLIF(TRIM(t.merchant), ''), NULLIF(TRIM(t.name), ''), 'Unknown')
       ORDER BY expenses DESC
       LIMIT 8`,
      analyticsValues,
    )

    return {
      timeSeries: timeSeriesResult.rows.map((row) => ({
        period: String(row["period"] ?? ""),
        income: Number(row["income"] ?? 0),
        expenses: Number(row["expenses"] ?? 0),
        date: new Date(row["period_date"] as string | Date),
      })),
      categoryBreakdown: categoryResult.rows.map((row) => ({
        code: String(row["code"] ?? "other"),
        name: String(row["name"] ?? "Other"),
        color: String(row["color"] ?? "#6b7280"),
        expenses: Number(row["expenses"] ?? 0),
        transactionCount: Number(row["transaction_count"] ?? 0),
      })),
      topMerchants: merchantResult.rows.map((row) => ({
        merchant: String(row["merchant"] ?? "Unknown"),
        expenses: Number(row["expenses"] ?? 0),
        transactionCount: Number(row["transaction_count"] ?? 0),
      })),
      profitTrend: timeSeriesResult.rows.map((row) => {
        const income = Number(row["income"] ?? 0)
        const expenses = Number(row["expenses"] ?? 0)
        return {
          period: String(row["period"] ?? ""),
          profit: income - expenses,
          date: new Date(row["period_date"] as string | Date),
        }
      }),
    }
  },
)

// ---------------------------------------------------------------------------
// Detailed time series stats (with category breakdowns)
// ---------------------------------------------------------------------------

export const getDetailedTimeSeriesStats = cache(
  async (
    userId: string,
    filters: TransactionFilters = {},
    defaultCurrency: string = "EUR",
  ): Promise<DetailedTimeSeriesData[]> => {
    const pool = await getPool()
    const { clause, values } = buildStatsWhere(userId, filters)

    // Determine grouping
    const rangeResult = await pool.query(
      `SELECT MIN(issued_at) AS min_date, MAX(issued_at) AS max_date
       FROM transactions ${clause} AND issued_at IS NOT NULL`,
      values,
    )

    const rangeRow = rangeResult.rows[0]
    if (!rangeRow?.["min_date"]) return []

    const dateFrom = filters.dateFrom
      ? new Date(filters.dateFrom)
      : new Date(rangeRow["min_date"] as string | Date)
    const dateTo = filters.dateTo
      ? new Date(filters.dateTo)
      : new Date(rangeRow["max_date"] as string | Date)
    const daysDiff = Math.ceil((dateTo.getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24))
    const groupByDay = daysDiff <= 50

    const periodExpr = groupByDay
      ? `TO_CHAR(t.issued_at, 'YYYY-MM-DD')`
      : `TO_CHAR(t.issued_at, 'YYYY-MM')`

    // Fetch categories for lookup
    const categoriesResult = await pool.query(
      `SELECT * FROM categories WHERE user_id = $1 ORDER BY name ASC`,
      [userId],
    )
    const categoryLookup = new Map<string, Category>(
      categoriesResult.rows.map((r) => {
        const c = mapRow<Category>(r)
        return [c.code, c]
      }),
    )

    // Build the grouped query with category breakdown
    const upperCurrency = defaultCurrency.toUpperCase()
    const { clause: tWhere, values: tValues, nextIdx } = buildTransactionWhere(
      userId,
      filters,
      { alias: "t", extraConditions: ["t.issued_at IS NOT NULL"] },
    )

    const currIdx2 = nextIdx
    tValues.push(upperCurrency)

    const detailResult = await pool.query(
      `SELECT
         ${periodExpr} AS period,
         MIN(t.issued_at) AS period_date,
         COALESCE(t.category_code, 'other') AS cat_code,
         SUM(CASE WHEN t.type = 'income' THEN
           CASE
             WHEN UPPER(t.converted_currency_code) = $${currIdx2} THEN COALESCE(t.converted_total, 0)
             WHEN UPPER(t.currency_code) = $${currIdx2} THEN COALESCE(t.total, 0)
             ELSE 0
           END ELSE 0 END)::float AS income,
         SUM(CASE WHEN t.type = 'expense' THEN
           CASE
             WHEN UPPER(t.converted_currency_code) = $${currIdx2} THEN COALESCE(t.converted_total, 0)
             WHEN UPPER(t.currency_code) = $${currIdx2} THEN COALESCE(t.total, 0)
             ELSE 0
           END ELSE 0 END)::float AS expenses,
         COUNT(*)::int AS transaction_count
       FROM transactions t
       ${tWhere}
       GROUP BY ${periodExpr}, COALESCE(t.category_code, 'other')
       ORDER BY ${periodExpr} ASC`,
      tValues,
    )

    // Aggregate into periods
    const periodMap = new Map<
      string,
      {
        period: string
        income: number
        expenses: number
        date: Date
        categories: Map<string, CategoryBreakdown>
        totalTransactions: number
      }
    >()

    for (const row of detailResult.rows) {
      const period = row["period"] as string
      if (!periodMap.has(period)) {
        periodMap.set(period, {
          period,
          income: 0,
          expenses: 0,
          date: new Date(row["period_date"] as string | Date),
          categories: new Map(),
          totalTransactions: 0,
        })
      }

      const entry = periodMap.get(period)!
      const catCode = row["cat_code"] as string
      const income = (row["income"] as number | null | undefined) ?? 0
      const expenses = (row["expenses"] as number | null | undefined) ?? 0
      const txCount = (row["transaction_count"] as number | null | undefined) ?? 0

      entry.income += income
      entry.expenses += expenses
      entry.totalTransactions += txCount

      const catInfo = categoryLookup.get(catCode) ?? {
        code: "other",
        name: "Other",
        color: "#6b7280",
      }

      if (!entry.categories.has(catCode)) {
        entry.categories.set(catCode, {
          code: catInfo.code,
          name: getLocalizedValue(catInfo.name, "en"),
          color: catInfo.color || "#6b7280",
          income: 0,
          expenses: 0,
          transactionCount: 0,
        })
      }

      const catData = entry.categories.get(catCode)!
      catData.income += income
      catData.expenses += expenses
      catData.transactionCount += txCount
    }

    return Array.from(periodMap.values())
      .map((item) => ({
        ...item,
        categories: Array.from(item.categories.values()).filter(
          (cat) => cat.income > 0 || cat.expenses > 0,
        ),
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime())
  },
)
