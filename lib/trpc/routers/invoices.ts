import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { router, authedProcedure } from "../init"
import {
  getInvoices,
  getInvoiceById,
  createInvoice,
  updateInvoice,
  updateInvoiceStatus,
  updateInvoiceContact,
  updateInvoiceCurrency,
  deleteInvoice,
  convertQuoteToInvoice,
  setInvoicePdfFileId,
  findDuplicateInvoice,
} from "@/models/invoices"
import { getFileById } from "@/models/files"
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
  contactId: z.string().nullish(),
  quoteId: z.string().nullish(),
  pdfFileId: z.string().nullish(),
  number: z.string(),
  status: z.string().optional(),
  issueDate: z.union([z.date(), z.string().transform((v) => new Date(v))]),
  dueDate: z.union([z.date(), z.string().transform((v) => new Date(v))]).nullish(),
  notes: z.string().nullish(),
  currencyCode: z.string().length(3).optional(),
  totalCents: z.number().int().nullish(),
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
    .input(
      z.object({
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        status: z.array(z.string()).optional(),
      }),
    )
    .output(z.array(invoiceWithRelationsSchema))
    .query(async ({ ctx, input }) => {
      const filters: { dateFrom?: string; dateTo?: string; status?: string[] } = {
        ...(input.dateFrom !== undefined && { dateFrom: input.dateFrom }),
        ...(input.dateTo !== undefined && { dateTo: input.dateTo }),
        ...(input.status !== undefined && { status: input.status }),
      }
      return getInvoices(ctx.user.id, filters)
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
      const dup = await findDuplicateInvoice(
        ctx.user.id,
        input.contactId ?? null,
        input.number,
      )
      if (dup) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `An invoice with number "${input.number}" already exists for this client.`,
        })
      }
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

  updateContact: authedProcedure
    .meta({ openapi: { method: "PATCH", path: "/api/v1/invoices/{id}/contact" } })
    .input(z.object({ id: z.string(), contactId: z.string().nullable() }))
    .output(invoiceSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return updateInvoiceContact(input.id, ctx.user.id, input.contactId)
    }),

  updateCurrency: authedProcedure
    .meta({ openapi: { method: "PATCH", path: "/api/v1/invoices/{id}/currency" } })
    .input(z.object({ id: z.string(), currencyCode: z.string().length(3) }))
    .output(invoiceSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return updateInvoiceCurrency(input.id, ctx.user.id, input.currencyCode)
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
      const dup = await findDuplicateInvoice(ctx.user.id, null, input.invoiceNumber)
      if (dup) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `An invoice with number "${input.invoiceNumber}" already exists.`,
        })
      }
      return convertQuoteToInvoice(input.quoteId, ctx.user.id, input.invoiceNumber)
    }),

  /**
   * Attach an already-stored file (e.g. an orphaned upload the user wants to
   * reuse) as this invoice's pdf_file_id. Both rows must belong to the
   * current user.
   */
  attachExistingFile: authedProcedure
    .input(z.object({ invoiceId: z.string(), fileId: z.string() }))
    .output(invoiceSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      const file = await getFileById(input.fileId, ctx.user.id)
      if (!file) {
        throw new TRPCError({ code: "NOT_FOUND", message: "File not found" })
      }
      const updated = await setInvoicePdfFileId(input.invoiceId, ctx.user.id, file.id)
      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" })
      }
      return updated
    }),
})
