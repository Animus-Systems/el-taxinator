/**
 * Compat layer for @/actions/clients — calls tRPC endpoints via fetch.
 */
import type { Client } from "@/lib/db-types"
import { formDataToObject, nullableStringValue, trpcMutate, type CompatActionResult } from "./shared"

function clientPayload(formData: FormData): Record<string, unknown> {
  const values = formDataToObject(formData)
  return {
    name: values.name,
    email: nullableStringValue(values.email),
    phone: nullableStringValue(values.phone),
    address: nullableStringValue(values.address),
    taxId: nullableStringValue(values.taxId),
    notes: nullableStringValue(values.notes),
  }
}

export async function createClientAction(data: Record<string, unknown>): Promise<CompatActionResult<Client | null>>
export async function createClientAction(
  _prevState: CompatActionResult<Client | null> | null,
  formData: FormData,
): Promise<CompatActionResult<Client | null>>
export async function createClientAction(
  arg1: Record<string, unknown> | CompatActionResult<Client | null> | null,
  arg2?: FormData,
): Promise<CompatActionResult<Client | null>> {
  const payload = arg2 ? clientPayload(arg2) : arg1
  try {
    const data = await trpcMutate<Client | null>("clients.create", payload)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to create client" }
  }
}

export async function updateClientAction(id: string, data: Record<string, unknown>): Promise<CompatActionResult<Client | null>>
export async function updateClientAction(
  _prevState: CompatActionResult<Client | null> | null,
  formData: FormData,
): Promise<CompatActionResult<Client | null>>
export async function updateClientAction(
  arg1: string | CompatActionResult<Client | null> | null,
  arg2: Record<string, unknown> | FormData,
): Promise<CompatActionResult<Client | null>> {
  const payload = arg2 instanceof FormData ? { id: formDataToObject(arg2).id, ...clientPayload(arg2) } : { id: arg1, ...arg2 }
  try {
    const data = await trpcMutate<Client | null>("clients.update", payload)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to update client" }
  }
}

export async function deleteClientAction(id: string): Promise<CompatActionResult<Client | null>>
export async function deleteClientAction(
  _prevState: CompatActionResult<Client | null> | null,
  id: string,
): Promise<CompatActionResult<Client | null>>
export async function deleteClientAction(
  arg1: string | CompatActionResult<Client | null> | null,
  arg2?: string,
): Promise<CompatActionResult<Client | null>> {
  const id = typeof arg1 === "string" ? arg1 : arg2
  try {
    const data = await trpcMutate<Client | null>("clients.delete", { id })
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to delete client" }
  }
}
