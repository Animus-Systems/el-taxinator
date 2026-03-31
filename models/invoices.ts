import { calcInvoiceTotals } from "@/lib/invoice-calculations"
import { prisma } from "@/lib/db"
import { cache } from "react"

export type InvoiceItemData = {
  productId?: string | null
  description: string
  quantity: number
  unitPrice: number
  vatRate: number
  position: number
}

export type InvoiceData = {
  clientId?: string | null
  quoteId?: string | null
  number: string
  status?: string
  issueDate: Date
  dueDate?: Date | null
  notes?: string | null
  irpfRate?: number
  items: InvoiceItemData[]
}

export type QuoteItemData = {
  productId?: string | null
  description: string
  quantity: number
  unitPrice: number
  vatRate: number
  position: number
}

export type QuoteData = {
  clientId?: string | null
  number: string
  status?: string
  issueDate: Date
  expiryDate?: Date | null
  notes?: string | null
  items: QuoteItemData[]
}

export const getInvoices = cache(async (userId: string) => {
  return prisma.invoice.findMany({
    where: { userId },
    include: { client: true, items: true },
    orderBy: { issueDate: "desc" },
  })
})

export const getInvoiceById = cache(async (id: string, userId: string) => {
  return prisma.invoice.findFirst({
    where: { id, userId },
    include: { client: true, items: { include: { product: true }, orderBy: { position: "asc" } }, quote: true },
  })
})

export async function createInvoice(userId: string, data: InvoiceData) {
  const { items, ...invoiceData } = data
  return prisma.invoice.create({
    data: {
      ...invoiceData,
      userId,
      items: { create: items },
    },
    include: { client: true, items: true },
  })
}

export async function updateInvoice(id: string, userId: string, data: InvoiceData) {
  const { items, ...invoiceData } = data
  return prisma.$transaction([
    prisma.invoiceItem.deleteMany({ where: { invoiceId: id } }),
    prisma.invoice.update({
      where: { id, userId },
      data: { ...invoiceData, items: { create: items } },
    }),
  ])
}

export async function updateInvoiceStatus(id: string, userId: string, status: string) {
  const data: { status: string; paidAt?: Date | null } = { status }
  if (status === "paid") data.paidAt = new Date()
  if (status !== "paid") data.paidAt = null
  return prisma.invoice.update({ where: { id, userId }, data })
}

export async function deleteInvoice(id: string, userId: string) {
  return prisma.invoice.delete({ where: { id, userId } })
}

export const getQuotes = cache(async (userId: string) => {
  return prisma.quote.findMany({
    where: { userId },
    include: { client: true, items: true },
    orderBy: { issueDate: "desc" },
  })
})

export const getQuoteById = cache(async (id: string, userId: string) => {
  return prisma.quote.findFirst({
    where: { id, userId },
    include: { client: true, items: { include: { product: true }, orderBy: { position: "asc" } }, invoice: true },
  })
})

export async function createQuote(userId: string, data: QuoteData) {
  const { items, ...quoteData } = data
  return prisma.quote.create({
    data: {
      ...quoteData,
      userId,
      items: { create: items },
    },
    include: { client: true, items: true },
  })
}

export async function updateQuote(id: string, userId: string, data: QuoteData) {
  const { items, ...quoteData } = data
  return prisma.$transaction([
    prisma.quoteItem.deleteMany({ where: { quoteId: id } }),
    prisma.quote.update({
      where: { id, userId },
      data: { ...quoteData, items: { create: items } },
    }),
  ])
}

export async function deleteQuote(id: string, userId: string) {
  return prisma.quote.delete({ where: { id, userId } })
}

export async function convertQuoteToInvoice(quoteId: string, userId: string, invoiceNumber: string) {
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, userId },
    include: { items: true },
  })
  if (!quote) throw new Error("Quote not found")

  const invoice = await prisma.invoice.create({
    data: {
      userId,
      clientId: quote.clientId,
      quoteId: quote.id,
      number: invoiceNumber,
      status: "draft",
      issueDate: new Date(),
      items: {
        create: quote.items.map((item) => ({
          productId: item.productId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          vatRate: item.vatRate,
          position: item.position,
        })),
      },
    },
    include: { client: true, items: true },
  })

  await prisma.quote.update({ where: { id: quoteId }, data: { status: "converted" } })
  return invoice
}
