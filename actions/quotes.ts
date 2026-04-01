"use server"

import { quoteFormSchema } from "@/forms/invoices"
import { ActionState, parseItemsFromFormData } from "@/lib/actions"
import { serverClient } from "@/lib/trpc/server-client"
import type { Quote } from "@/lib/db-types"
import { revalidatePath } from "next/cache"

export async function createQuoteAction(
  _prev: ActionState<Quote> | null,
  formData: FormData
): Promise<ActionState<Quote>> {
  try {
    const trpc = await serverClient()
    const parsed = quoteFormSchema.safeParse({
      clientId: (formData.get("clientId") as string) || null,
      number: formData.get("number"),
      status: formData.get("status") || "draft",
      issueDate: formData.get("issueDate"),
      expiryDate: (formData.get("expiryDate") as string) || null,
      notes: (formData.get("notes") as string) || null,
      items: parseItemsFromFormData(formData.get("items")),
    })
    if (!parsed.success) return { success: false, error: parsed.error.message }

    const quote = await trpc.quotes.create(parsed.data)
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
    const trpc = await serverClient()
    const quoteId = formData.get("quoteId") as string
    const parsed = quoteFormSchema.safeParse({
      clientId: (formData.get("clientId") as string) || null,
      number: formData.get("number"),
      status: formData.get("status") || "draft",
      issueDate: formData.get("issueDate"),
      expiryDate: (formData.get("expiryDate") as string) || null,
      notes: (formData.get("notes") as string) || null,
      items: parseItemsFromFormData(formData.get("items")),
    })
    if (!parsed.success) return { success: false, error: parsed.error.message }

    await trpc.quotes.update({ id: quoteId, ...parsed.data })
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
    const trpc = await serverClient()
    const quote = await trpc.quotes.delete({ id: quoteId })
    revalidatePath("/quotes")
    return { success: true, data: quote }
  } catch (e) {
    console.error(e)
    return { success: false, error: "Failed to delete quote" }
  }
}
