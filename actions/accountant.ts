"use server"

import { getCurrentUser } from "@/lib/auth"
import { serverClient } from "@/lib/trpc/server-client"
import { updateAccountantInvite } from "@/models/accountants"
import { AccountantPermissions } from "@/models/accountants"
import { revalidatePath } from "next/cache"

export async function createInviteAction(
  formData: FormData
) {
  const trpc = await serverClient()
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

  await trpc.accountants.createInvite({ name, email, permissions, expiresAt })
  revalidatePath("/settings/accountant")
}

export async function revokeInviteAction(inviteId: string) {
  const trpc = await serverClient()
  await trpc.accountants.revokeInvite({ id: inviteId })
  revalidatePath("/settings/accountant")
}

export async function deleteInviteAction(inviteId: string) {
  const trpc = await serverClient()
  await trpc.accountants.deleteInvite({ id: inviteId })
  revalidatePath("/settings/accountant")
}

export async function reactivateInviteAction(inviteId: string) {
  // No tRPC route for updateAccountantInvite, keep as model call
  const user = await getCurrentUser()
  await updateAccountantInvite(inviteId, user.id, { isActive: true })
  revalidatePath("/settings/accountant")
}
