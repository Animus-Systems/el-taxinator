import { z } from "zod"
import { router, authedProcedure } from "../init"
import {
  getQuotes,
  getQuoteById,
  createQuote,
  updateQuote,
  deleteQuote,
} from "@/models/invoices"
import type { QuoteData } from "@/models/invoices"
import {
  quoteSchema,
  quoteItemSchema,
  clientSchema,
  productSchema,
  invoiceSchema,
} from "@/lib/db-types"

// Quote item with optional product relation
const quoteItemWithProductSchema = quoteItemSchema.extend({
  product: productSchema.nullable().optional(),
}).passthrough()

// Quote with relations (items, client, invoice)
const quoteWithRelationsSchema = quoteSchema.extend({
  items: z.array(quoteItemWithProductSchema),
  client: clientSchema.nullable(),
  invoice: invoiceSchema.nullable().optional(),
}).passthrough()

const quoteItemInputSchema = z.object({
  productId: z.string().nullish(),
  description: z.string(),
  quantity: z.number().positive(),
  unitPrice: z.number(),
  vatRate: z.number().min(0).max(100),
  position: z.number().int().default(0),
})

const quoteInputSchema = z.object({
  clientId: z.string().nullish(),
  number: z.string(),
  status: z.string().optional(),
  issueDate: z.union([z.date(), z.string().transform((v) => new Date(v))]),
  expiryDate: z.union([z.date(), z.string().transform((v) => new Date(v))]).nullish(),
  notes: z.string().nullish(),
  items: z.array(quoteItemInputSchema).min(1),
})

// updateQuote returns [{ count }, { ...quote, items }] as const tuple
const quoteUpdateResultSchema = z.tuple([
  z.object({ count: z.number() }),
  quoteSchema.extend({
    items: z.array(quoteItemSchema.passthrough()),
  }).passthrough(),
])

export const quotesRouter = router({
  list: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/quotes" } })
    .input(z.object({}))
    .output(z.array(quoteWithRelationsSchema))
    .query(async ({ ctx }) => {
      return getQuotes(ctx.user.id)
    }),

  getById: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/quotes/{id}" } })
    .input(z.object({ id: z.string() }))
    .output(quoteWithRelationsSchema.nullable())
    .query(async ({ ctx, input }) => {
      return getQuoteById(input.id, ctx.user.id)
    }),

  create: authedProcedure
    .meta({ openapi: { method: "POST", path: "/api/v1/quotes" } })
    .input(quoteInputSchema)
    .output(quoteWithRelationsSchema)
    .mutation(async ({ ctx, input }) => {
      return createQuote(ctx.user.id, input as QuoteData)
    }),

  update: authedProcedure
    .meta({ openapi: { method: "PUT", path: "/api/v1/quotes/{id}" } })
    .input(z.object({ id: z.string() }).merge(quoteInputSchema))
    .output(quoteUpdateResultSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      return updateQuote(id, ctx.user.id, data as QuoteData)
    }),

  delete: authedProcedure
    .meta({ openapi: { method: "DELETE", path: "/api/v1/quotes/{id}" } })
    .input(z.object({ id: z.string() }))
    .output(quoteSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return deleteQuote(input.id, ctx.user.id)
    }),
})
