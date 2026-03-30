"use server"

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

    const startedAt = formData.get("startedAt") as string
    const endedAt = (formData.get("endedAt") as string) || null
    const durationRaw = formData.get("durationMinutes") as string
    const hourlyRateRaw = formData.get("hourlyRate") as string

    const entry = await createTimeEntry(user.id, {
      description: (formData.get("description") as string) || null,
      projectCode: (formData.get("projectCode") as string) || null,
      clientId: (formData.get("clientId") as string) || null,
      startedAt: new Date(startedAt),
      endedAt: endedAt ? new Date(endedAt) : null,
      durationMinutes: durationRaw ? parseInt(durationRaw) : null,
      hourlyRate: hourlyRateRaw ? Math.round(parseFloat(hourlyRateRaw) * 100) : null,
      currencyCode: (formData.get("currencyCode") as string) || null,
      isBillable: formData.get("isBillable") === "true",
      notes: (formData.get("notes") as string) || null,
    })

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

    const startedAt = formData.get("startedAt") as string
    const endedAt = (formData.get("endedAt") as string) || null
    const durationRaw = formData.get("durationMinutes") as string
    const hourlyRateRaw = formData.get("hourlyRate") as string

    await updateTimeEntry(id, user.id, {
      description: (formData.get("description") as string) || null,
      projectCode: (formData.get("projectCode") as string) || null,
      clientId: (formData.get("clientId") as string) || null,
      startedAt: new Date(startedAt),
      endedAt: endedAt ? new Date(endedAt) : null,
      durationMinutes: durationRaw ? parseInt(durationRaw) : null,
      hourlyRate: hourlyRateRaw ? Math.round(parseFloat(hourlyRateRaw) * 100) : null,
      currencyCode: (formData.get("currencyCode") as string) || null,
      isBillable: formData.get("isBillable") === "true",
      notes: (formData.get("notes") as string) || null,
    })

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
