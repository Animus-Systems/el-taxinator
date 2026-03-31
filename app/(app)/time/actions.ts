"use server"

import { timeEntryFormSchema } from "@/forms/time"
import { ActionState } from "@/lib/actions"
import { getCurrentUser } from "@/lib/auth"
import {
  createTimeEntry,
  deleteTimeEntry,
  markTimeEntriesInvoiced,
  updateTimeEntry,
} from "@/models/time-entries"
import { revalidatePath } from "next/cache"

export async function createTimeEntryAction(
  _prev: ActionState<{ id: string }> | null,
  formData: FormData
): Promise<ActionState<{ id: string }>> {
  try {
    const user = await getCurrentUser()
    const parsed = timeEntryFormSchema.safeParse(Object.fromEntries(formData.entries()))
    if (!parsed.success) return { success: false, error: parsed.error.message }

    const entry = await createTimeEntry(user.id, parsed.data)

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
    const user = await getCurrentUser()
    const id = formData.get("id") as string
    const parsed = timeEntryFormSchema.safeParse(Object.fromEntries(formData.entries()))
    if (!parsed.success) return { success: false, error: parsed.error.message }

    await updateTimeEntry(id, user.id, parsed.data)

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
    const user = await getCurrentUser()
    await deleteTimeEntry(entryId, user.id)
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
    const user = await getCurrentUser()
    await markTimeEntriesInvoiced(ids, user.id)
    revalidatePath("/time")
    revalidatePath("/invoices")
    return { success: true }
  } catch (e) {
    console.error(e)
    return { success: false, error: "Failed to mark entries as invoiced" }
  }
}
