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
  updateInvoiceTotalCents,
  deleteInvoice,
  convertQuoteToInvoice,
  setInvoicePdfFileId,
  findDuplicateInvoice,
  listNumbersByKind,
} from "@/models/invoices"
import { suggestNextInvoiceNumber } from "@/lib/invoice-series"
import { getFileById } from "@/models/files"
import type { InvoiceData } from "@/models/invoices"
import { applyFxRate, regenerateInvoicePdfSafe } from "@/lib/invoice-pdf-generation"
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
  templateId: z.string().nullish(),
  number: z.string(),
  kind: z.enum(["invoice", "simplified"]).optional(),
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

  /**
   * Non-blocking duplicate check for the invoice number field. The create
   * mutation enforces uniqueness on submit, but typing the same number as
   * an existing invoice surfaces this warning inline so the user can fix
   * it before clicking Create. `excludeId` lets the edit form ignore the
   * row it's currently editing.
   */
  checkDuplicate: authedProcedure
    .input(z.object({ number: z.string(), excludeId: z.string().optional() }))
    .output(z.object({ duplicate: z.boolean(), existingId: z.string().nullable() }))
    .query(async ({ ctx, input }) => {
      const trimmed = input.number.trim()
      if (!trimmed) return { duplicate: false, existingId: null }
      const dup = await findDuplicateInvoice(ctx.user.id, null, trimmed)
      if (!dup) return { duplicate: false, existingId: null }
      if (input.excludeId && dup.id === input.excludeId) {
        return { duplicate: false, existingId: null }
      }
      return { duplicate: true, existingId: dup.id }
    }),

  /**
   * Suggest the next invoice number for this user based on existing rows
   * in the requested kind's series. Falls back to a date-stamped placeholder
   * when the user has no invoices of that kind yet.
   */
  nextNumber: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/invoices/next-number" } })
    .input(z.object({ kind: z.enum(["invoice", "simplified"]) }))
    .output(z.object({ number: z.string() }))
    .query(async ({ ctx, input }) => {
      const rows = await listNumbersByKind(ctx.user.id, input.kind)
      const now = new Date()
      const prefix = input.kind === "simplified" ? "R" : "F"
      const fallback = `${prefix}-${now.getFullYear()}-${String(
        now.getMonth() + 1,
      ).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-001`
      return { number: suggestNextInvoiceNumber(rows, fallback) }
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
      const fx = await applyFxRate({
        currencyCode: input.currencyCode ?? "EUR",
        issueDate: input.issueDate,
        fxRateToEur: null,
        fxRateDate: null,
        fxRateSource: null,
      })
      const invoice = await createInvoice(ctx.user.id, { ...input, ...fx } as InvoiceData)
      // Auto-generate the PDF so drafts have an attached file immediately,
      // ready to preview or send. Rendering failures are logged but don't
      // block creation — the UI's Regenerate button is always a fallback.
      await regenerateInvoicePdfSafe(invoice.id, ctx.user)
      return invoice
    }),

  update: authedProcedure
    .meta({ openapi: { method: "PUT", path: "/api/v1/invoices/{id}" } })
    .input(z.object({ id: z.string() }).merge(invoiceInputSchema))
    .output(invoiceUpdateResultSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      // Read the existing row so an idempotent re-save (same issue date,
      // same currency) reuses the originally-locked rate instead of racing
      // to ECB on every edit.
      const existing = await getInvoiceById(id, ctx.user.id)
      const fx = await applyFxRate({
        currencyCode: data.currencyCode ?? existing?.currencyCode ?? "EUR",
        issueDate: data.issueDate,
        fxRateToEur: existing?.fxRateToEur ?? null,
        fxRateDate: existing?.fxRateDate ?? null,
        fxRateSource: existing?.fxRateSource ?? null,
      })
      const result = await updateInvoice(id, ctx.user.id, { ...data, ...fx } as InvoiceData)
      // Content changed — the attached PDF is now stale. Regenerate so the
      // stored file matches what the UI shows.
      await regenerateInvoicePdfSafe(id, ctx.user)
      return result
    }),

  updateStatus: authedProcedure
    .meta({ openapi: { method: "PATCH", path: "/api/v1/invoices/{id}/status" } })
    .input(z.object({ id: z.string(), status: z.string() }))
    .output(invoiceSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      const updated = await updateInvoiceStatus(input.id, ctx.user.id, input.status)
      if (updated) {
        // Status transitions (draft → sent, sent → paid, etc.) are a natural
        // checkpoint to refresh the attached PDF — the renderer will pick
        // up any template or business-detail changes the user made since
        // the invoice was originally created.
        await regenerateInvoicePdfSafe(input.id, ctx.user)
      }
      return updated
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
      // Need the invoice's issue_date to look up the ECB rate for the new
      // currency. Also must force a fresh lookup: the old stored rate was
      // for the previous currency, so passing null inputs sidesteps the
      // idempotency check in applyFxRate.
      const existing = await getInvoiceById(input.id, ctx.user.id)
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" })
      }
      const fx = await applyFxRate({
        currencyCode: input.currencyCode,
        issueDate: existing.issueDate,
        fxRateToEur: null,
        fxRateDate: null,
        fxRateSource: null,
      })
      const updated = await updateInvoiceCurrency(
        input.id,
        ctx.user.id,
        input.currencyCode,
        fx,
      )
      // Regenerate the attached PDF so the printed totals (and the FX
      // block) reflect the new currency.
      if (updated) await regenerateInvoicePdfSafe(input.id, ctx.user)
      return updated
    }),

  /** Overwrite the printed-total override. `null` clears the override so the
   *  display falls back to line-item reconstruction. */
  setTotal: authedProcedure
    .meta({ openapi: { method: "PATCH", path: "/api/v1/invoices/{id}/total" } })
    .input(
      z.object({
        id: z.string(),
        totalCents: z.number().int().positive().nullable(),
      }),
    )
    .output(invoiceSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return updateInvoiceTotalCents(input.id, ctx.user.id, input.totalCents)
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
