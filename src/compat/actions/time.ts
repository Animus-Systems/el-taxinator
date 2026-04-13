/**
 * Compat layer for @/actions/time — calls tRPC endpoints via fetch.
 */
import { booleanValue, formDataToObject, nullableStringValue, numberValue, trpcMutate, type CompatActionResult } from "./shared"

function timeEntryPayload(formData: FormData): Record<string, unknown> {
  const values = formDataToObject(formData)
  return {
    id: nullableStringValue(values.id),
    description: nullableStringValue(values.description),
    projectCode: nullableStringValue(values.projectCode),
    clientId: nullableStringValue(values.clientId),
    startedAt: values.startedAt,
    endedAt: nullableStringValue(values.endedAt),
    durationMinutes: numberValue(values.durationMinutes),
    hourlyRate: numberValue(values.hourlyRate),
    currencyCode: nullableStringValue(values.currencyCode),
    isBillable: booleanValue(values.isBillable),
    notes: nullableStringValue(values.notes),
  }
}

export async function createTimeEntryAction(data: Record<string, unknown>): Promise<CompatActionResult<unknown>>
export async function createTimeEntryAction(
  _prevState: CompatActionResult<unknown> | null,
  formData: FormData,
): Promise<CompatActionResult<unknown>>
export async function createTimeEntryAction(
  arg1: Record<string, unknown> | CompatActionResult<unknown> | null,
  arg2?: FormData,
): Promise<CompatActionResult<unknown>> {
  const payload = arg2 ? timeEntryPayload(arg2) : arg1
  try {
    const data = await trpcMutate("timeEntries.create", payload)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to create time entry" }
  }
}

export async function updateTimeEntryAction(id: string, data: Record<string, unknown>): Promise<CompatActionResult<unknown>>
export async function updateTimeEntryAction(
  _prevState: CompatActionResult<unknown> | null,
  formData: FormData,
): Promise<CompatActionResult<unknown>>
export async function updateTimeEntryAction(
  arg1: string | CompatActionResult<unknown> | null,
  arg2: Record<string, unknown> | FormData,
): Promise<CompatActionResult<unknown>> {
  const payload = arg2 instanceof FormData ? timeEntryPayload(arg2) : { id: arg1, ...arg2 }
  try {
    const data = await trpcMutate("timeEntries.update", payload)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to update time entry" }
  }
}

export async function deleteTimeEntryAction(id: string): Promise<CompatActionResult<unknown>>
export async function deleteTimeEntryAction(
  _prevState: CompatActionResult<unknown> | null,
  id: string,
): Promise<CompatActionResult<unknown>>
export async function deleteTimeEntryAction(
  arg1: string | CompatActionResult<unknown> | null,
  arg2?: string,
): Promise<CompatActionResult<unknown>> {
  const id = typeof arg1 === "string" ? arg1 : arg2
  try {
    const data = await trpcMutate("timeEntries.delete", { id })
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to delete time entry" }
  }
}

export async function markInvoicedAction(_ids: string[]) {
  return { success: false as const, error: "Bulk mark-as-invoiced is not yet available in SPA mode" }
}
