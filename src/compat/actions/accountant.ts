/**
 * Compat layer for @/actions/accountant — calls tRPC endpoints via fetch.
 */
import { formDataToObject, trpcMutate, type CompatActionResult } from "./shared"

function invitePayloadFromFormData(formData: FormData) {
  const data = formDataToObject(formData)
  return {
    name: data["name"],
    email: data["email"] || null,
    expiresAt: data["expires_at"] || null,
    permissions: {
      transactions: data["perm_transactions"] === "on",
      invoices: data["perm_invoices"] === "on",
      tax: data["perm_tax"] === "on",
    },
  }
}

export async function createInviteAction(data: Record<string, unknown>): Promise<CompatActionResult>
export async function createInviteAction(formData: FormData): Promise<CompatActionResult>
export async function createInviteAction(
  _prevState: CompatActionResult | null,
  formData: FormData,
): Promise<CompatActionResult>
export async function createInviteAction(
  arg1: Record<string, unknown> | FormData | CompatActionResult | null,
  arg2?: FormData,
): Promise<CompatActionResult> {
  const payload = arg2
    ? invitePayloadFromFormData(arg2)
    : arg1 instanceof FormData
      ? invitePayloadFromFormData(arg1)
      : arg1

  try {
    await trpcMutate("accountants.createInvite", payload)
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create invite",
    }
  }
}

export async function revokeInviteAction(id: string): Promise<CompatActionResult>
export async function revokeInviteAction(
  _prevState: CompatActionResult | null,
  id: string,
): Promise<CompatActionResult>
export async function revokeInviteAction(
  arg1: string | CompatActionResult | null,
  arg2?: string,
): Promise<CompatActionResult> {
  const id = typeof arg1 === "string" ? arg1 : arg2

  try {
    await trpcMutate("accountants.revokeInvite", { id })
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to revoke invite",
    }
  }
}

export async function deleteInviteAction(id: string): Promise<CompatActionResult>
export async function deleteInviteAction(
  _prevState: CompatActionResult | null,
  id: string,
): Promise<CompatActionResult>
export async function deleteInviteAction(
  arg1: string | CompatActionResult | null,
  arg2?: string,
): Promise<CompatActionResult> {
  const id = typeof arg1 === "string" ? arg1 : arg2

  try {
    await trpcMutate("accountants.deleteInvite", { id })
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete invite",
    }
  }
}

export async function reactivateInviteAction(_id: string) {
  return { success: false as const, error: "Reactivate invite is not yet available in SPA mode" }
}
