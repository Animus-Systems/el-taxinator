"use server"

import { clientFormSchema } from "@/forms/clients"
import { ActionState } from "@/lib/actions"
import { serverClient } from "@/lib/trpc/server-client"
import type { Client } from "@/lib/db-types"
import { revalidatePath } from "next/cache"

export async function createClientAction(
  _prev: ActionState<Client> | null,
  formData: FormData
): Promise<ActionState<Client>> {
  try {
    const trpc = await serverClient()
    const parsed = clientFormSchema.safeParse(Object.fromEntries(formData.entries()))
    if (!parsed.success) return { success: false, error: parsed.error.message }

    const client = await trpc.clients.create({
      ...parsed.data,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      address: parsed.data.address || null,
      taxId: parsed.data.taxId || null,
      notes: parsed.data.notes || null,
    })
    revalidatePath("/clients")
    return { success: true, data: client }
  } catch (e) {
    console.error(e)
    return { success: false, error: "Failed to create client" }
  }
}

export async function updateClientAction(
  _prev: ActionState<Client> | null,
  formData: FormData
): Promise<ActionState<Client>> {
  try {
    const trpc = await serverClient()
    const clientId = formData.get("clientId") as string
    const parsed = clientFormSchema.safeParse(Object.fromEntries(formData.entries()))
    if (!parsed.success) return { success: false, error: parsed.error.message }

    const client = await trpc.clients.update({
      id: clientId,
      ...parsed.data,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      address: parsed.data.address || null,
      taxId: parsed.data.taxId || null,
      notes: parsed.data.notes || null,
    })
    revalidatePath("/clients")
    return { success: true, data: client }
  } catch (e) {
    console.error(e)
    return { success: false, error: "Failed to update client" }
  }
}

export async function deleteClientAction(
  _prev: ActionState<Client> | null,
  clientId: string
): Promise<ActionState<Client>> {
  try {
    const trpc = await serverClient()
    const client = await trpc.clients.delete({ id: clientId })
    revalidatePath("/clients")
    return { success: true, data: client }
  } catch (e) {
    console.error(e)
    return { success: false, error: "Failed to delete client" }
  }
}
