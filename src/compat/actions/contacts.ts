/**
 * Compat layer for @/actions/contacts — calls tRPC endpoints via fetch.
 */
import type { Contact } from "@/lib/db-types"
import { formDataToObject, nullableStringValue, trpcMutate, type CompatActionResult } from "./shared"

function contactPayload(formData: FormData): Record<string, unknown> {
  const values = formDataToObject(formData)
  const role = values["role"]
  const kind = values["kind"]
  return {
    name: values["name"],
    email: nullableStringValue(values["email"]),
    phone: nullableStringValue(values["phone"]),
    mobile: nullableStringValue(values["mobile"]),
    address: nullableStringValue(values["address"]),
    city: nullableStringValue(values["city"]),
    postalCode: nullableStringValue(values["postalCode"]),
    province: nullableStringValue(values["province"]),
    country: nullableStringValue(values["country"]),
    taxId: nullableStringValue(values["taxId"]),
    bankDetails: nullableStringValue(values["bankDetails"]),
    notes: nullableStringValue(values["notes"]),
    ...(role === "client" || role === "supplier" || role === "both" ? { role } : {}),
    ...(kind === "company" || kind === "person" ? { kind } : {}),
  }
}

export async function createContactAction(data: Record<string, unknown>): Promise<CompatActionResult<Contact | null>>
export async function createContactAction(
  _prevState: CompatActionResult<Contact | null> | null,
  formData: FormData,
): Promise<CompatActionResult<Contact | null>>
export async function createContactAction(
  arg1: Record<string, unknown> | CompatActionResult<Contact | null> | null,
  arg2?: FormData,
): Promise<CompatActionResult<Contact | null>> {
  const payload = arg2 ? contactPayload(arg2) : arg1
  try {
    const data = await trpcMutate<Contact | null>("contacts.create", payload)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to create contact" }
  }
}

export async function updateContactAction(id: string, data: Record<string, unknown>): Promise<CompatActionResult<Contact | null>>
export async function updateContactAction(
  _prevState: CompatActionResult<Contact | null> | null,
  formData: FormData,
): Promise<CompatActionResult<Contact | null>>
export async function updateContactAction(
  arg1: string | CompatActionResult<Contact | null> | null,
  arg2: Record<string, unknown> | FormData,
): Promise<CompatActionResult<Contact | null>> {
  const payload = arg2 instanceof FormData ? { id: formDataToObject(arg2)["id"], ...contactPayload(arg2) } : { id: arg1, ...arg2 }
  try {
    const data = await trpcMutate<Contact | null>("contacts.update", payload)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to update contact" }
  }
}

export async function deleteContactAction(id: string): Promise<CompatActionResult<Contact | null>>
export async function deleteContactAction(
  _prevState: CompatActionResult<Contact | null> | null,
  id: string,
): Promise<CompatActionResult<Contact | null>>
export async function deleteContactAction(
  arg1: string | CompatActionResult<Contact | null> | null,
  arg2?: string,
): Promise<CompatActionResult<Contact | null>> {
  const id = typeof arg1 === "string" ? arg1 : arg2
  try {
    const data = await trpcMutate<Contact | null>("contacts.delete", { id })
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to delete contact" }
  }
}
