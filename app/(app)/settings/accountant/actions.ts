"use server"

import { createAccountantInvite, deleteAccountantInvite, revokeAccountantInvite, updateAccountantInvite } from "@/models/accountants"
import { AccountantPermissions } from "@/models/accountants"
import { revalidatePath } from "next/cache"

export async function createInviteAction(
  userId: string,
  formData: FormData
) {
  const name = (formData.get("name") as string)?.trim()
  const email = (formData.get("email") as string)?.trim() || null
  const expiresAtStr = formData.get("expires_at") as string | null

  if (!name) throw new Error("Name is required")

  const permissions: AccountantPermissions = {
    transactions: formData.get("perm_transactions") === "on",
    invoices: formData.get("perm_invoices") === "on",
    tax: formData.get("perm_tax") === "on",
    time: formData.get("perm_time") === "on",
  }

  const expiresAt = expiresAtStr ? new Date(expiresAtStr) : null

  await createAccountantInvite(userId, { name, email, permissions, expiresAt })
  revalidatePath("/settings/accountant")
}

export async function revokeInviteAction(userId: string, inviteId: string) {
  await revokeAccountantInvite(inviteId, userId)
  revalidatePath("/settings/accountant")
}

export async function deleteInviteAction(userId: string, inviteId: string) {
  await deleteAccountantInvite(inviteId, userId)
  revalidatePath("/settings/accountant")
}

export async function reactivateInviteAction(userId: string, inviteId: string) {
  await updateAccountantInvite(inviteId, userId, { isActive: true })
  revalidatePath("/settings/accountant")
}
