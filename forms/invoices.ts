import { z } from "zod"

const invoiceItemSchema = z.object({
  productId: z.string().uuid().optional().nullable(),
  description: z.string().min(1).max(512),
  quantity: z.number().positive(),
  unitPrice: z.number().int(),
  vatRate: z.number().min(0).max(100),
  position: z.number().int().default(0),
})

export const invoiceFormSchema = z.object({
  clientId: z.string().uuid().optional().nullable(),
  number: z.string().min(1).max(64),
  status: z.enum(["draft", "sent", "paid", "overdue", "cancelled"]).default("draft"),
  issueDate: z.union([
    z.date(),
    z.string().transform((v) => new Date(v)),
  ]),
  dueDate: z
    .union([z.date(), z.string().transform((v) => new Date(v))])
    .optional()
    .nullable(),
  notes: z.string().max(1024).optional().nullable(),
  items: z.array(invoiceItemSchema).min(1),
})

export const quoteFormSchema = z.object({
  clientId: z.string().uuid().optional().nullable(),
  number: z.string().min(1).max(64),
  status: z.enum(["draft", "sent", "accepted", "rejected", "converted"]).default("draft"),
  issueDate: z.union([
    z.date(),
    z.string().transform((v) => new Date(v)),
  ]),
  expiryDate: z
    .union([z.date(), z.string().transform((v) => new Date(v))])
    .optional()
    .nullable(),
  notes: z.string().max(1024).optional().nullable(),
  items: z.array(invoiceItemSchema).min(1),
})

export type InvoiceFormData = z.infer<typeof invoiceFormSchema>
export type QuoteFormData = z.infer<typeof quoteFormSchema>
