"use server"

import { ActionState } from "@/lib/actions"
import { getCurrentUser } from "@/lib/auth"
import { createQuote, deleteQuote, updateQuote } from "@/models/invoices"
import { Quote } from "@/prisma/client"
import { revalidatePath } from "next/cache"

function parseItems(raw: string) {
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export async function createQuoteAction(
  _prev: ActionState<Quote> | null,
  formData: FormData
): Promise<ActionState<Quote>> {
  try {
    const user = await getCurrentUser()
    const quote = await createQuote(user.id, {
      clientId: (formData.get("clientId") as string) || null,
      number: formData.get("number") as string,
      status: (formData.get("status") as string) || "draft",
      issueDate: new Date(formData.get("issueDate") as string),
      expiryDate: formData.get("expiryDate") ? new Date(formData.get("expiryDate") as string) : null,
      notes: (formData.get("notes") as string) || null,
      items: parseItems(formData.get("items") as string),
    })
    revalidatePath("/quotes")
    return { success: true, data: quote }
  } catch (e) {
    console.error(e)
    return { success: false, error: "Failed to create quote" }
  }
}

export async function updateQuoteAction(
  _prev: ActionState<Quote> | null,
  formData: FormData
): Promise<ActionState<Quote>> {
  try {
    const user = await getCurrentUser()
    const quoteId = formData.get("quoteId") as string
    await updateQuote(quoteId, user.id, {
      clientId: (formData.get("clientId") as string) || null,
      number: formData.get("number") as string,
      status: (formData.get("status") as string) || "draft",
      issueDate: new Date(formData.get("issueDate") as string),
      expiryDate: formData.get("expiryDate") ? new Date(formData.get("expiryDate") as string) : null,
      notes: (formData.get("notes") as string) || null,
      items: parseItems(formData.get("items") as string),
    })
    revalidatePath("/quotes")
    revalidatePath(`/quotes/${quoteId}`)
    return { success: true }
  } catch (e) {
    console.error(e)
    return { success: false, error: "Failed to update quote" }
  }
}

export async function deleteQuoteAction(
  _prev: ActionState<Quote> | null,
  quoteId: string
): Promise<ActionState<Quote>> {
  try {
    const user = await getCurrentUser()
    const quote = await deleteQuote(quoteId, user.id)
    revalidatePath("/quotes")
    return { success: true, data: quote }
  } catch (e) {
    console.error(e)
    return { success: false, error: "Failed to delete quote" }
  }
}
