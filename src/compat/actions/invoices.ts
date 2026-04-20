/**
 * Compat layer for @/actions/invoices — calls tRPC endpoints via fetch.
 */
import { formDataToObject, nullableStringValue, numberValue, parseJsonField, trpcMutate, type CompatActionResult } from "./shared"

function invoicePayload(formData: FormData): Record<string, unknown> {
  const values = formDataToObject(formData)
  const rawCurrency = nullableStringValue(values["currencyCode"])
  const rawKind = nullableStringValue(values["kind"])
  const kind = rawKind === "simplified" ? "simplified" : rawKind === "invoice" ? "invoice" : undefined
  return {
    contactId: nullableStringValue(values["contactId"]),
    quoteId: nullableStringValue(values["quoteId"]),
    number: values["number"],
    kind,
    status: nullableStringValue(values["status"]),
    issueDate: values["issueDate"],
    dueDate: nullableStringValue(values["dueDate"]),
    notes: nullableStringValue(values["notes"]),
    currencyCode: rawCurrency ? rawCurrency.toUpperCase() : undefined,
    irpfRate: numberValue(values["irpfRate"]),
    items: parseJsonField(values["items"], []),
  }
}

export async function createInvoiceAction(data: Record<string, unknown>): Promise<CompatActionResult<{ id: string }>>
export async function createInvoiceAction(
  _prevState: CompatActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<CompatActionResult<{ id: string }>>
export async function createInvoiceAction(
  arg1: Record<string, unknown> | CompatActionResult<{ id: string }> | null,
  arg2?: FormData,
): Promise<CompatActionResult<{ id: string }>> {
  const payload = arg2 ? invoicePayload(arg2) : arg1
  try {
    const data = await trpcMutate<{ id: string }>("invoices.create", payload)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to create invoice" }
  }
}

export async function updateInvoiceAction(id: string, data: Record<string, unknown>): Promise<CompatActionResult<unknown>>
export async function updateInvoiceAction(
  _prevState: CompatActionResult<unknown> | null,
  formData: FormData,
): Promise<CompatActionResult<unknown>>
export async function updateInvoiceAction(
  arg1: string | CompatActionResult<unknown> | null,
  arg2: Record<string, unknown> | FormData,
): Promise<CompatActionResult<unknown>> {
  const payload = arg2 instanceof FormData ? { id: formDataToObject(arg2)["id"], ...invoicePayload(arg2) } : { id: arg1, ...arg2 }
  try {
    const data = await trpcMutate("invoices.update", payload)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to update invoice" }
  }
}

export async function updateInvoiceStatusAction(
  id: string,
  status: string,
): Promise<CompatActionResult>
export async function updateInvoiceStatusAction(
  _prevState: CompatActionResult<unknown> | null,
  formData: FormData,
): Promise<CompatActionResult>
export async function updateInvoiceStatusAction(
  arg1: string | CompatActionResult<unknown> | null,
  arg2: string | FormData,
): Promise<CompatActionResult> {
  const payload =
    arg2 instanceof FormData
      ? {
          id: formDataToObject(arg2)["invoiceId"],
          status: formDataToObject(arg2)["status"],
        }
      : { id: arg1, status: arg2 }

  try {
    await trpcMutate("invoices.updateStatus", payload)
    return { success: true as const }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : "Failed to update invoice status" }
  }
}

export async function deleteInvoiceAction(id: string): Promise<CompatActionResult<unknown>>
export async function deleteInvoiceAction(
  _prevState: CompatActionResult<unknown> | null,
  id: string,
): Promise<CompatActionResult<unknown>>
export async function deleteInvoiceAction(
  arg1: string | CompatActionResult<unknown> | null,
  arg2?: string,
): Promise<CompatActionResult<unknown>> {
  const id = typeof arg1 === "string" ? arg1 : arg2
  try {
    const data = await trpcMutate("invoices.delete", { id })
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to delete invoice" }
  }
}

export async function convertQuoteToInvoiceAction(
  quoteId: string,
  invoiceNumber?: string,
): Promise<CompatActionResult<{ id: string }>>
export async function convertQuoteToInvoiceAction(
  _prevState: CompatActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<CompatActionResult<{ id: string }>>
export async function convertQuoteToInvoiceAction(
  arg1: string | CompatActionResult<{ id: string }> | null,
  arg2?: string | FormData,
): Promise<CompatActionResult<{ id: string }>> {
  const payload =
    arg2 instanceof FormData
      ? {
          quoteId: formDataToObject(arg2)["quoteId"],
          invoiceNumber: formDataToObject(arg2)["invoiceNumber"],
        }
      : { quoteId: arg1, invoiceNumber: arg2 }
  try {
    const data = await trpcMutate<{ id: string }>("invoices.convertFromQuote", payload)
    return { success: true as const, data }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : "Failed to convert quote to invoice" }
  }
}
