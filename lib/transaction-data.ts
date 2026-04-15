import type { Field } from "@/lib/db-types"
import type { TransactionData } from "@/models/transactions"

const BUILT_IN_TRANSACTION_KEYS = new Set<keyof TransactionData>([
  "name",
  "description",
  "merchant",
  "total",
  "currencyCode",
  "convertedTotal",
  "convertedCurrencyCode",
  "type",
  "items",
  "note",
  "files",
  "categoryCode",
  "accountId",
  "projectCode",
  "issuedAt",
  "text",
  "deductible",
  "status",
])

export function splitTransactionDataByFieldDefinitions(
  data: TransactionData,
  fields: Field[],
): { standard: TransactionData; extra: Record<string, unknown> } {
  const fieldMap = fields.reduce(
    (acc, field) => {
      acc[field.code] = field
      return acc
    },
    {} as Record<string, Field>,
  )

  const standard: TransactionData = {}
  const extra: Record<string, unknown> = {}

  Object.entries(data).forEach(([key, value]) => {
    if (key === "extra" && value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(extra, value as Record<string, unknown>)
      return
    }

    if (BUILT_IN_TRANSACTION_KEYS.has(key as keyof TransactionData)) {
      standard[key] = value
      return
    }

    const fieldDef = fieldMap[key]
    if (!fieldDef) return

    if (fieldDef.isExtra) {
      extra[key] = value
    } else {
      standard[key] = value
    }
  })

  return { standard, extra }
}
