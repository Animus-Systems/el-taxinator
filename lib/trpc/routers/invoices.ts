import { z } from "zod"
import { router, authedProcedure } from "../init"
import {
  getInvoices,
  getInvoiceById,
  createInvoice,
  updateInvoice,
  updateInvoiceStatus,
  deleteInvoice,
  convertQuoteToInvoice,
} from "@/models/invoices"
import type { InvoiceData } from "@/models/invoices"
import {
  invoiceSchema,
  invoiceItemSchema,
  clientSchema,
  productSchema,
  quoteSchema,
} from "@/lib/db-types"

// Invoice item with optional product relation
const invoiceItemWithProductSchema = invoiceItemSchema.extend({
  product: productSchema.nullable().optional(),
}).passthrough()

// Invoice with relations (items, client, quote)
const invoiceWithRelationsSchema = invoiceSchema.extend({
  items: z.array(invoiceItemWithProductSchema),
  client: clientSchema.nullable(),
  quote: quoteSchema.nullable().optional(),
}).passthrough()

const invoiceItemInputSchema = z.object({
  productId: z.string().nullish(),
  description: z.string(),
  quantity: z.number().positive(),
  unitPrice: z.number(),
  vatRate: z.number().min(0).max(100),
  position: z.number().int().default(0),
})

const invoiceInputSchema = z.object({
  clientId: z.string().nullish(),
  quoteId: z.string().nullish(),
  number: z.string(),
  status: z.string().optional(),
  issueDate: z.union([z.date(), z.string().transform((v) => new Date(v))]),
  dueDate: z.union([z.date(), z.string().transform((v) => new Date(v))]).nullish(),
  notes: z.string().nullish(),
  irpfRate: z.number().min(0).max(100).optional(),
  items: z.array(invoiceItemInputSchema).min(1),
})

// updateInvoice returns [{ count }, { ...invoice, items }] as const tuple
const invoiceUpdateResultSchema = z.tuple([
  z.object({ count: z.number() }),
  invoiceSchema.extend({
    items: z.array(invoiceItemSchema.passthrough()),
  }).passthrough(),
])

export const invoicesRouter = router({
  list: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/invoices" } })
    .input(z.object({}))
    .output(z.array(invoiceWithRelationsSchema))
    .query(async ({ ctx }) => {
      return getInvoices(ctx.user.id)
    }),

  getById: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/invoices/{id}" } })
    .input(z.object({ id: z.string() }))
    .output(invoiceWithRelationsSchema.nullable())
    .query(async ({ ctx, input }) => {
      return getInvoiceById(input.id, ctx.user.id)
    }),

  create: authedProcedure
    .meta({ openapi: { method: "POST", path: "/api/v1/invoices" } })
    .input(invoiceInputSchema)
    .output(invoiceWithRelationsSchema)
    .mutation(async ({ ctx, input }) => {
      return createInvoice(ctx.user.id, input as InvoiceData)
    }),

  update: authedProcedure
    .meta({ openapi: { method: "PUT", path: "/api/v1/invoices/{id}" } })
    .input(z.object({ id: z.string() }).merge(invoiceInputSchema))
    .output(invoiceUpdateResultSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      return updateInvoice(id, ctx.user.id, data as InvoiceData)
    }),

  updateStatus: authedProcedure
    .meta({ openapi: { method: "PATCH", path: "/api/v1/invoices/{id}/status" } })
    .input(z.object({ id: z.string(), status: z.string() }))
    .output(invoiceSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return updateInvoiceStatus(input.id, ctx.user.id, input.status)
    }),

  delete: authedProcedure
    .meta({ openapi: { method: "DELETE", path: "/api/v1/invoices/{id}" } })
    .input(z.object({ id: z.string() }))
    .output(invoiceSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return deleteInvoice(input.id, ctx.user.id)
    }),

  convertFromQuote: authedProcedure
    .meta({ openapi: { method: "POST", path: "/api/v1/invoices/from-quote/{quoteId}" } })
    .input(z.object({ quoteId: z.string(), invoiceNumber: z.string() }))
    .output(invoiceWithRelationsSchema)
    .mutation(async ({ ctx, input }) => {
      return convertQuoteToInvoice(input.quoteId, ctx.user.id, input.invoiceNumber)
    }),
})
