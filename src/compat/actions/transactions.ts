/**
 * Compat layer for @/actions/transactions — calls tRPC endpoints via fetch.
 */
import type { BankAccount, Category, Currency, Field, Transaction, Project } from "@/lib/db-types"
import {
  booleanValue,
  formDataToObject,
  nullableStringValue,
  numberValue,
  parseJsonField,
  trpcMutate,
  trpcQuery,
  type CompatActionResult,
} from "./shared"

type ActionState<T> = CompatActionResult<T>

function transactionPayloadFromFormData(formData: FormData): Record<string, unknown> {
  const values = formDataToObject(formData)
  const payload: Record<string, unknown> = {
    name: nullableStringValue(values["name"]),
    merchant: nullableStringValue(values["merchant"]),
    description: nullableStringValue(values["description"]),
    note: nullableStringValue(values["note"]),
    currencyCode: nullableStringValue(values["currencyCode"]),
    convertedCurrencyCode: nullableStringValue(values["convertedCurrencyCode"]),
    type: nullableStringValue(values["type"]),
    categoryCode: nullableStringValue(values["categoryCode"]),
    projectCode: nullableStringValue(values["projectCode"]),
    accountId: nullableStringValue(values["accountId"]),
    issuedAt: nullableStringValue(values["issuedAt"]),
    text: nullableStringValue(values["text"]),
    total: numberValue(values["total"]),
    convertedTotal: numberValue(values["convertedTotal"]),
    deductible: booleanValue(values["deductible"]),
    files: parseJsonField<string[]>(values["files"], []),
    items: parseJsonField<unknown[]>(values["items"], []),
  }

  const transactionId = nullableStringValue(values["transactionId"])
  if (transactionId) {
    payload["id"] = transactionId
  }

  const reservedKeys = new Set([
    "transactionId",
    "name",
    "merchant",
    "description",
    "note",
    "currencyCode",
    "convertedCurrencyCode",
    "type",
    "categoryCode",
    "projectCode",
    "accountId",
    "issuedAt",
    "text",
    "total",
    "convertedTotal",
    "deductible",
    "files",
    "items",
  ])

  const extra: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(values)) {
    if (!reservedKeys.has(key)) {
      extra[key] = value
    }
  }

  if (Object.keys(extra).length > 0) {
    payload["extra"] = extra
  }

  return payload
}

export async function getNewTransactionFormDataAction(): Promise<{
  categories: Category[]
  projects: Project[]
  accounts: BankAccount[]
  fields: Field[]
  currencies: Currency[]
  settings: Record<string, string>
}> {
  try {
    const [categories, projects, accounts, fields, currencies, settings] = await Promise.all([
      trpcQuery<Category[]>("categories.list", {}).catch(() => []),
      trpcQuery<Project[]>("projects.list", {}).catch(() => []),
      trpcQuery<BankAccount[]>("accounts.list", {}).catch(() => []),
      trpcQuery<Field[]>("fields.list", {}).catch(() => []),
      trpcQuery<Currency[]>("currencies.list", {}).catch(() => []),
      trpcQuery<Record<string, string>>("settings.get", {}).catch(() => ({})),
    ])

    return { categories, projects, accounts, fields, currencies, settings }
  } catch {
    return { categories: [], projects: [], accounts: [], fields: [], currencies: [], settings: {} }
  }
}

export async function createTransactionAction(data: Record<string, unknown>): Promise<ActionState<Transaction>>
export async function createTransactionAction(
  _prevState: ActionState<Transaction> | null,
  formData: FormData,
): Promise<ActionState<Transaction>>
export async function createTransactionAction(
  arg1: Record<string, unknown> | ActionState<Transaction> | null,
  arg2?: FormData,
): Promise<ActionState<Transaction>> {
  const payload = arg2 ? transactionPayloadFromFormData(arg2) : (arg1 ?? {})

  try {
    const transaction = await trpcMutate<Transaction>("transactions.create", payload)
    return { success: true, data: transaction }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create transaction",
    }
  }
}

export async function saveTransactionAction(
  id: string,
  data: Record<string, unknown>,
): Promise<ActionState<Transaction>>
export async function saveTransactionAction(
  _prevState: ActionState<Transaction> | null,
  formData: FormData,
): Promise<ActionState<Transaction>>
export async function saveTransactionAction(
  arg1: string | ActionState<Transaction> | null,
  arg2: Record<string, unknown> | FormData,
): Promise<ActionState<Transaction>> {
  const payload =
    arg2 instanceof FormData
      ? transactionPayloadFromFormData(arg2)
      : { id: arg1, ...arg2 }

  try {
    const transaction = await trpcMutate<Transaction>("transactions.update", payload)
    return { success: true, data: transaction }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save transaction",
    }
  }
}

export async function deleteTransactionAction(id: string): Promise<ActionState<Transaction>>
export async function deleteTransactionAction(
  _prevState: ActionState<Transaction> | null,
  id: string,
): Promise<ActionState<Transaction>>
export async function deleteTransactionAction(
  arg1: string | ActionState<Transaction> | null,
  arg2?: string,
): Promise<ActionState<Transaction>> {
  const id = typeof arg1 === "string" ? arg1 : arg2

  try {
    const transaction = await trpcMutate<Transaction>("transactions.delete", { id })
    return { success: true, data: transaction }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete transaction",
    }
  }
}

export async function deleteTransactionFileAction(transactionId: string, fileId: string) {
  try {
    const transaction = await trpcQuery<Transaction | null>("transactions.getById", { id: transactionId })
    if (!transaction) return { success: false as const, error: "Transaction not found" }

    const currentFiles = Array.isArray(transaction.files) ? (transaction.files as string[]) : []
    const files = currentFiles.filter((currentFileId) => currentFileId !== fileId)

    await trpcMutate("transactions.updateFiles", { id: transactionId, files })
    return { success: true as const }
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Failed to delete file",
    }
  }
}

export async function uploadTransactionFilesAction(formData: FormData): Promise<ActionState<Transaction>> {
  try {
    const response = await fetch("/api/files/upload", {
      method: "POST",
      body: formData,
    })
    if (!response.ok) {
      return { success: false, error: `Upload failed: ${response.statusText}` }
    }
    return { success: true }
  } catch (error) {
    return { success: false, error: `Upload failed: ${String(error)}` }
  }
}

export async function bulkDeleteTransactionsAction(transactionIds: string[]) {
  try {
    await trpcMutate("transactions.bulkDelete", { ids: transactionIds })
    return { success: true as const }
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Failed to bulk delete",
    }
  }
}

export async function updateFieldVisibilityAction(fieldCode: string, isVisible: boolean) {
  try {
    await trpcMutate("fields.update", { code: fieldCode, isVisibleInList: isVisible })
    return { success: true as const }
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Failed to update field visibility",
    }
  }
}
