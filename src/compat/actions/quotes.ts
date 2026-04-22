/**
 * Compat layer for @/actions/quotes — calls tRPC endpoints via fetch.
 */
import { formDataToObject, nullableStringValue, parseJsonField, trpcMutate, type CompatActionResult } from "./shared"

function quotePayload(formData: FormData): Record<string, unknown> {
  const values = formDataToObject(formData)
  return {
    contactId: nullableStringValue(values["contactId"]),
    templateId: nullableStringValue(values["templateId"]),
    number: values["number"],
    status: nullableStringValue(values["status"]),
    issueDate: values["issueDate"],
    expiryDate: nullableStringValue(values["expiryDate"]),
    notes: nullableStringValue(values["notes"]),
    items: parseJsonField(values["items"], []),
  }
}

export async function createQuoteAction(data: Record<string, unknown>): Promise<CompatActionResult<{ id: string }>>
export async function createQuoteAction(
  _prevState: CompatActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<CompatActionResult<{ id: string }>>
export async function createQuoteAction(
  arg1: Record<string, unknown> | CompatActionResult<{ id: string }> | null,
  arg2?: FormData,
): Promise<CompatActionResult<{ id: string }>> {
  const payload = arg2 ? quotePayload(arg2) : arg1
  try {
    const data = await trpcMutate<{ id: string }>("quotes.create", payload)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to create quote" }
  }
}

export async function updateQuoteAction(id: string, data: Record<string, unknown>): Promise<CompatActionResult<unknown>>
export async function updateQuoteAction(
  _prevState: CompatActionResult<unknown> | null,
  formData: FormData,
): Promise<CompatActionResult<unknown>>
export async function updateQuoteAction(
  arg1: string | CompatActionResult<unknown> | null,
  arg2: Record<string, unknown> | FormData,
): Promise<CompatActionResult<unknown>> {
  const payload = arg2 instanceof FormData ? { id: formDataToObject(arg2)["id"], ...quotePayload(arg2) } : { id: arg1, ...arg2 }
  try {
    const data = await trpcMutate("quotes.update", payload)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to update quote" }
  }
}

export async function deleteQuoteAction(id: string): Promise<CompatActionResult<unknown>>
export async function deleteQuoteAction(
  _prevState: CompatActionResult<unknown> | null,
  id: string,
): Promise<CompatActionResult<unknown>>
export async function deleteQuoteAction(
  arg1: string | CompatActionResult<unknown> | null,
  arg2?: string,
): Promise<CompatActionResult<unknown>> {
  const id = typeof arg1 === "string" ? arg1 : arg2
  try {
    const data = await trpcMutate("quotes.delete", { id })
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to delete quote" }
  }
}
