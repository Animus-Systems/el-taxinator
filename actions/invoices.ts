"use server"

import { invoiceFormSchema } from "@/forms/invoices"
import { ActionState, parseItemsFromFormData } from "@/lib/actions"
import { serverClient } from "@/lib/trpc/server-client"
import type { Invoice } from "@/lib/db-types"
import { revalidatePath } from "next/cache"

export async function createInvoiceAction(
  _prev: ActionState<Invoice> | null,
  formData: FormData
): Promise<ActionState<Invoice>> {
  try {
    const trpc = await serverClient()
    const parsed = invoiceFormSchema.safeParse({
      clientId: (formData.get("clientId") as string) || null,
      number: formData.get("number"),
      status: formData.get("status") || "draft",
      issueDate: formData.get("issueDate"),
      dueDate: (formData.get("dueDate") as string) || null,
      notes: (formData.get("notes") as string) || null,
      irpfRate: formData.get("irpfRate") || 0,
      items: parseItemsFromFormData(formData.get("items")),
    })
    if (!parsed.success) return { success: false, error: parsed.error.message }

    const invoice = await trpc.invoices.create(parsed.data)
    revalidatePath("/invoices")
    return { success: true, data: invoice }
  } catch (e) {
    console.error(e)
    return { success: false, error: "Failed to create invoice" }
  }
}

export async function updateInvoiceAction(
  _prev: ActionState<Invoice> | null,
  formData: FormData
): Promise<ActionState<Invoice>> {
  try {
    const trpc = await serverClient()
    const invoiceId = formData.get("invoiceId") as string
    const parsed = invoiceFormSchema.safeParse({
      clientId: (formData.get("clientId") as string) || null,
      number: formData.get("number"),
      status: formData.get("status") || "draft",
      issueDate: formData.get("issueDate"),
      dueDate: (formData.get("dueDate") as string) || null,
      notes: (formData.get("notes") as string) || null,
      irpfRate: formData.get("irpfRate") || 0,
      items: parseItemsFromFormData(formData.get("items")),
    })
    if (!parsed.success) return { success: false, error: parsed.error.message }

    await trpc.invoices.update({ id: invoiceId, ...parsed.data })
    revalidatePath("/invoices")
    revalidatePath(`/invoices/${invoiceId}`)
    return { success: true }
  } catch (e) {
    console.error(e)
    return { success: false, error: "Failed to update invoice" }
  }
}

export async function updateInvoiceStatusAction(
  _prev: ActionState<Invoice> | null,
  formData: FormData
): Promise<ActionState<Invoice>> {
  try {
    const trpc = await serverClient()
    const invoiceId = formData.get("invoiceId") as string
    const status = formData.get("status") as string
    const invoice = await trpc.invoices.updateStatus({ id: invoiceId, status })
    revalidatePath("/invoices")
    revalidatePath(`/invoices/${invoiceId}`)
    return { success: true, data: invoice }
  } catch (e) {
    console.error(e)
    return { success: false, error: "Failed to update invoice status" }
  }
}

export async function deleteInvoiceAction(
  _prev: ActionState<Invoice> | null,
  invoiceId: string
): Promise<ActionState<Invoice>> {
  try {
    const trpc = await serverClient()
    const invoice = await trpc.invoices.delete({ id: invoiceId })
    revalidatePath("/invoices")
    return { success: true, data: invoice }
  } catch (e) {
    console.error(e)
    return { success: false, error: "Failed to delete invoice" }
  }
}

export async function convertQuoteToInvoiceAction(
  _prev: ActionState<Invoice> | null,
  formData: FormData
): Promise<ActionState<Invoice>> {
  try {
    const trpc = await serverClient()
    const quoteId = formData.get("quoteId") as string
    const invoiceNumber = formData.get("invoiceNumber") as string
    const invoice = await trpc.invoices.convertFromQuote({ quoteId, invoiceNumber })
    revalidatePath("/invoices")
    revalidatePath("/quotes")
    return { success: true, data: invoice }
  } catch (e) {
    console.error(e)
    return { success: false, error: "Failed to convert quote to invoice" }
  }
}
