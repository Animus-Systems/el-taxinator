"use server"

import { ActionState } from "@/lib/actions"
import { getCurrentUser } from "@/lib/auth"
import {
  convertQuoteToInvoice,
  createInvoice,
  deleteInvoice,
  updateInvoice,
  updateInvoiceStatus,
} from "@/models/invoices"
import { Invoice } from "@/prisma/client"
import { revalidatePath } from "next/cache"

function parseItems(raw: string) {
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export async function createInvoiceAction(
  _prev: ActionState<Invoice> | null,
  formData: FormData
): Promise<ActionState<Invoice>> {
  try {
    const user = await getCurrentUser()
    const invoice = await createInvoice(user.id, {
      clientId: (formData.get("clientId") as string) || null,
      number: formData.get("number") as string,
      status: (formData.get("status") as string) || "draft",
      issueDate: new Date(formData.get("issueDate") as string),
      dueDate: formData.get("dueDate") ? new Date(formData.get("dueDate") as string) : null,
      notes: (formData.get("notes") as string) || null,
      irpfRate: parseFloat((formData.get("irpfRate") as string) || "0") || 0,
      items: parseItems(formData.get("items") as string),
    })
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
    const user = await getCurrentUser()
    const invoiceId = formData.get("invoiceId") as string
    await updateInvoice(invoiceId, user.id, {
      clientId: (formData.get("clientId") as string) || null,
      number: formData.get("number") as string,
      status: (formData.get("status") as string) || "draft",
      issueDate: new Date(formData.get("issueDate") as string),
      dueDate: formData.get("dueDate") ? new Date(formData.get("dueDate") as string) : null,
      notes: (formData.get("notes") as string) || null,
      irpfRate: parseFloat((formData.get("irpfRate") as string) || "0") || 0,
      items: parseItems(formData.get("items") as string),
    })
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
    const user = await getCurrentUser()
    const invoiceId = formData.get("invoiceId") as string
    const status = formData.get("status") as string
    const invoice = await updateInvoiceStatus(invoiceId, user.id, status)
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
    const user = await getCurrentUser()
    const invoice = await deleteInvoice(invoiceId, user.id)
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
    const user = await getCurrentUser()
    const quoteId = formData.get("quoteId") as string
    const invoiceNumber = formData.get("invoiceNumber") as string
    const invoice = await convertQuoteToInvoice(quoteId, user.id, invoiceNumber)
    revalidatePath("/invoices")
    revalidatePath("/quotes")
    return { success: true, data: invoice }
  } catch (e) {
    console.error(e)
    return { success: false, error: "Failed to convert quote to invoice" }
  }
}
