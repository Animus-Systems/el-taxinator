/**
 * Compat layer for @/actions/import.
 */
import { formDataToObject, parseJsonField, trpcMutate, type CompatActionResult } from "./shared"

type CsvRows = string[][]

export async function parseCSVAction(
  _prevState: CompatActionResult<CsvRows> | null,
  formData: FormData,
): Promise<CompatActionResult<CsvRows>> {
  const file = formData.get("file")
  if (!(file instanceof File)) {
    return { success: false, error: "CSV file is required" }
  }

  try {
    const text = await file.text()
    const rows = text
      .split(/\r?\n/)
      .filter((line) => line.length > 0)
      .map((line) => line.split(",").map((cell) => cell.trim()))
    return { success: true, data: rows }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to parse CSV",
    }
  }
}

export async function saveTransactionsAction(
  _prevState: CompatActionResult | null,
  formData: FormData,
): Promise<CompatActionResult<{ count: number }>> {
  const values = formDataToObject(formData)
  const rows = parseJsonField<Array<Record<string, unknown>>>(values["rows"], [])

  try {
    await Promise.all(rows.map((row) => trpcMutate("transactions.create", row)))
    return { success: true, data: { count: rows.length } }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save transactions",
    }
  }
}
