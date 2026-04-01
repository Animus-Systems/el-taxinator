"use server"

import { timeEntryFormSchema } from "@/forms/time"
import { ActionState } from "@/lib/actions"
import { serverClient } from "@/lib/trpc/server-client"
import { revalidatePath } from "next/cache"

export async function createTimeEntryAction(
  _prev: ActionState<{ id: string }> | null,
  formData: FormData
): Promise<ActionState<{ id: string }>> {
  try {
    const trpc = await serverClient()
    const parsed = timeEntryFormSchema.safeParse(Object.fromEntries(formData.entries()))
    if (!parsed.success) return { success: false, error: parsed.error.message }

    const entry = await trpc.timeEntries.create(parsed.data)

    revalidatePath("/time")
    return { success: true, data: { id: entry.id } }
  } catch (e) {
    console.error(e)
    return { success: false, error: "Failed to create time entry" }
  }
}

export async function updateTimeEntryAction(
  _prev: ActionState<{ id: string }> | null,
  formData: FormData
): Promise<ActionState<{ id: string }>> {
  try {
    const trpc = await serverClient()
    const id = formData.get("id") as string
    const parsed = timeEntryFormSchema.safeParse(Object.fromEntries(formData.entries()))
    if (!parsed.success) return { success: false, error: parsed.error.message }

    await trpc.timeEntries.update({ id, ...parsed.data })

    revalidatePath("/time")
    revalidatePath(`/time/${id}`)
    return { success: true, data: { id } }
  } catch (e) {
    console.error(e)
    return { success: false, error: "Failed to update time entry" }
  }
}

export async function deleteTimeEntryAction(
  _prev: ActionState<null> | null,
  entryId: string
): Promise<ActionState<null>> {
  try {
    const trpc = await serverClient()
    await trpc.timeEntries.delete({ id: entryId })
    revalidatePath("/time")
    return { success: true }
  } catch (e) {
    console.error(e)
    return { success: false, error: "Failed to delete time entry" }
  }
}

export async function markInvoicedAction(
  _prev: ActionState<null> | null,
  ids: string[]
): Promise<ActionState<null>> {
  try {
    const trpc = await serverClient()
    await trpc.timeEntries.markInvoiced({ ids })
    revalidatePath("/time")
    revalidatePath("/invoices")
    return { success: true }
  } catch (e) {
    console.error(e)
    return { success: false, error: "Failed to mark entries as invoiced" }
  }
}
