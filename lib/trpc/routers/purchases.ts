import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { router, authedProcedure } from "../init"
import {
  getPurchases,
  getPurchaseById,
  createPurchase,
  updatePurchase,
  updatePurchaseStatus,
  updatePurchaseTotalCents,
  deletePurchase,
  setPurchasePdfFileId,
  findDuplicatePurchase,
} from "@/models/purchases"
import { getFileById, updateFile, attachFileToTransaction } from "@/models/files"
import { listPaymentsForPurchase } from "@/models/purchase-payments"
import { getContacts, createContact } from "@/models/contacts"
import type { PurchaseData } from "@/models/purchases"
import {
  purchaseSchema,
  purchaseItemSchema,
  contactSchema,
  productSchema,
} from "@/lib/db-types"

type ReceiptExtracted = {
  vendor: string | null
  vendorTaxId: string | null
  total: number | null
  vatRate: number | null
  issueDate: string | null
  currency: string | null
}

function readExtracted(metadata: unknown): ReceiptExtracted | null {
  if (!metadata || typeof metadata !== "object") return null
  const md = metadata as Record<string, unknown>
  const extracted = md["extracted"]
  if (!extracted || typeof extracted !== "object") return null
  const ex = extracted as Record<string, unknown>
  const asString = (v: unknown): string | null =>
    typeof v === "string" && v.trim() !== "" ? v.trim() : null
  const asNumber = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null
  return {
    vendor: asString(ex["vendor"]),
    vendorTaxId: asString(ex["vendorTaxId"]),
    total: asNumber(ex["total"]),
    vatRate: asNumber(ex["vatRate"]),
    issueDate: asString(ex["issueDate"]),
    currency: asString(ex["currency"]),
  }
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ")
}

const purchaseItemWithProductSchema = purchaseItemSchema.extend({
  product: productSchema.nullable().optional(),
}).passthrough()

const purchaseWithRelationsSchema = purchaseSchema.extend({
  items: z.array(purchaseItemWithProductSchema),
  contact: contactSchema.nullable(),
}).passthrough()

const purchaseItemInputSchema = z.object({
  productId: z.string().nullish(),
  description: z.string(),
  quantity: z.number().positive(),
  unitPrice: z.number(),
  vatRate: z.number().min(0).max(100),
  position: z.number().int().default(0),
})

const purchaseInputSchema = z.object({
  contactId: z.string().nullish(),
  pdfFileId: z.string().nullish(),
  supplierInvoiceNumber: z.string().min(1).max(128),
  status: z.string().optional(),
  issueDate: z.union([z.date(), z.string().transform((v) => new Date(v))]),
  dueDate: z.union([z.date(), z.string().transform((v) => new Date(v))]).nullish(),
  currencyCode: z.string().optional(),
  totalCents: z.number().int().nullish(),
  irpfRate: z.number().min(0).max(100).optional(),
  notes: z.string().nullish(),
  items: z.array(purchaseItemInputSchema).min(1),
})

const purchaseUpdateResultSchema = z.tuple([
  z.object({ count: z.number() }),
  purchaseSchema.extend({
    items: z.array(purchaseItemSchema.passthrough()),
  }).passthrough(),
])

export const purchasesRouter = router({
  list: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/purchases" } })
    .input(
      z.object({
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        status: z.array(z.string()).optional(),
      }),
    )
    .output(z.array(purchaseWithRelationsSchema))
    .query(async ({ ctx, input }) => {
      const filters: { dateFrom?: string; dateTo?: string; status?: string[] } = {
        ...(input.dateFrom !== undefined && { dateFrom: input.dateFrom }),
        ...(input.dateTo !== undefined && { dateTo: input.dateTo }),
        ...(input.status !== undefined && { status: input.status }),
      }
      return getPurchases(ctx.user.id, filters)
    }),

  getById: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/purchases/{id}" } })
    .input(z.object({ id: z.string() }))
    .output(purchaseWithRelationsSchema.nullable())
    .query(async ({ ctx, input }) => {
      return getPurchaseById(input.id, ctx.user.id)
    }),

  create: authedProcedure
    .meta({ openapi: { method: "POST", path: "/api/v1/purchases" } })
    .input(purchaseInputSchema)
    .output(purchaseWithRelationsSchema)
    .mutation(async ({ ctx, input }) => {
      const dup = await findDuplicatePurchase(
        ctx.user.id,
        input.contactId ?? null,
        input.supplierInvoiceNumber,
      )
      if (dup) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A purchase with invoice number "${input.supplierInvoiceNumber}" already exists for this supplier.`,
        })
      }
      return createPurchase(ctx.user.id, input as PurchaseData)
    }),

  update: authedProcedure
    .meta({ openapi: { method: "PUT", path: "/api/v1/purchases/{id}" } })
    .input(z.object({ id: z.string() }).merge(purchaseInputSchema))
    .output(purchaseUpdateResultSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      return updatePurchase(id, ctx.user.id, data as PurchaseData)
    }),

  updateStatus: authedProcedure
    .meta({ openapi: { method: "PATCH", path: "/api/v1/purchases/{id}/status" } })
    .input(
      z.object({
        id: z.string(),
        status: z.enum(["draft", "received", "overdue", "paid", "cancelled", "refunded"]),
        paidAt: z.union([z.date(), z.string().transform((v) => new Date(v))]).nullish(),
      }),
    )
    .output(purchaseSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      const paidAt = input.paidAt === undefined ? undefined : input.paidAt
      return updatePurchaseStatus(input.id, ctx.user.id, input.status, paidAt ?? null)
    }),

  /** Overwrite the printed-total override. `null` clears. */
  setTotal: authedProcedure
    .meta({ openapi: { method: "PATCH", path: "/api/v1/purchases/{id}/total" } })
    .input(
      z.object({
        id: z.string(),
        totalCents: z.number().int().positive().nullable(),
      }),
    )
    .output(purchaseSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return updatePurchaseTotalCents(input.id, ctx.user.id, input.totalCents)
    }),

  delete: authedProcedure
    .meta({ openapi: { method: "DELETE", path: "/api/v1/purchases/{id}" } })
    .input(z.object({ id: z.string() }))
    .output(purchaseSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return deletePurchase(input.id, ctx.user.id)
    }),

  /**
   * Turn an uploaded receipt (file whose metadata has an `extracted` block
   * from the LLM receipt pipeline) into a purchase draft. Creates or reuses
   * a contact by tax ID or normalized name, attaches the receipt PDF as the
   * purchase's PDF, and marks the file reviewed.
   */
  createFromReceipt: authedProcedure
    .input(z.object({ fileId: z.string() }))
    .output(purchaseSchema)
    .mutation(async ({ ctx, input }) => {
      const file = await getFileById(input.fileId, ctx.user.id)
      if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "Receipt not found" })
      const extracted = readExtracted(file.metadata)
      if (!extracted) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Receipt has no extracted metadata",
        })
      }

      // Auto-match or create supplier contact.
      let contactId: string | null = null
      if (extracted.vendor) {
        const contacts = await getContacts(ctx.user.id)
        const byTax = extracted.vendorTaxId
          ? contacts.find((c) => c.taxId && c.taxId.trim() === extracted.vendorTaxId!.trim())
          : null
        const byName = byTax
          ?? contacts.find((c) => normalizeName(c.name) === normalizeName(extracted.vendor!))
        if (byName) {
          contactId = byName.id
        } else {
          const created = await createContact(ctx.user.id, {
            name: extracted.vendor,
            email: null,
            phone: null,
            mobile: null,
            address: null,
            city: null,
            postalCode: null,
            province: null,
            country: null,
            taxId: extracted.vendorTaxId,
            bankDetails: null,
            notes: null,
            role: "supplier",
            kind: "company",
          })
          if (created) contactId = created.id
        }
      }

      const totalCents = Math.round((extracted.total ?? 0) * 100)
      const vatRate = extracted.vatRate ?? 0
      const unitPriceCents =
        vatRate > 0
          ? Math.round(totalCents / (1 + vatRate / 100))
          : totalCents
      const issueDate = extracted.issueDate ? new Date(extracted.issueDate) : new Date()

      const description = extracted.vendor
        ? `Receipt from ${extracted.vendor}`
        : "Receipt"

      const purchase = await createPurchase(ctx.user.id, {
        contactId,
        pdfFileId: file.id,
        supplierInvoiceNumber: file.filename.replace(/\.[^.]+$/, "").slice(0, 64),
        status: "draft",
        issueDate,
        currencyCode: extracted.currency ?? "EUR",
        // The receipt extraction gives us the printed total directly; store
        // it authoritatively so later read-back doesn't drift by a cent or
        // two from VAT reconstruction.
        totalCents: totalCents > 0 ? totalCents : null,
        irpfRate: 0,
        notes: null,
        items: [
          {
            productId: null,
            description,
            quantity: 1,
            unitPrice: unitPriceCents,
            vatRate,
            position: 0,
          },
        ],
      })

      await updateFile(file.id, ctx.user.id, { isReviewed: true })
      return purchase
    }),

  attachExistingFile: authedProcedure
    .input(z.object({ purchaseId: z.string(), fileId: z.string() }))
    .output(purchaseSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      const file = await getFileById(input.fileId, ctx.user.id)
      if (!file) {
        throw new TRPCError({ code: "NOT_FOUND", message: "File not found" })
      }
      const updated = await setPurchasePdfFileId(input.purchaseId, ctx.user.id, file.id)
      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Purchase not found" })
      }
      // Mirror the attachment onto any transactions this purchase is already
      // paying — so the supplier invoice shows up in /transactions too.
      const payments = await listPaymentsForPurchase(input.purchaseId, ctx.user.id)
      for (const p of payments) {
        await attachFileToTransaction(ctx.user.id, p.transactionId, file.id)
      }
      return updated
    }),

  detachPdf: authedProcedure
    .input(z.object({ purchaseId: z.string() }))
    .output(purchaseSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      const updated = await setPurchasePdfFileId(input.purchaseId, ctx.user.id, null)
      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Purchase not found" })
      }
      return updated
    }),

  /**
   * Commit a batch of AI-extracted purchase candidates at once. Used by the
   * "AI Import" flow on /purchases. For rows that carry a supplier name we
   * match against existing contacts by taxId then by normalized name, and
   * create a supplier contact inline when nothing matches — so the purchase
   * is correctly attributed without a second step. Unit prices come in as
   * EUROS and are converted to cents before insert.
   */
  bulkCreate: authedProcedure
    .input(
      z.object({
        purchases: z
          .array(
            z.object({
              supplierName: z.string().nullish(),
              supplierTaxId: z.string().nullish(),
              supplierInvoiceNumber: z.string().min(1).max(128),
              pdfFileId: z.string().nullish(),
              issueDate: z.union([z.date(), z.string().transform((v) => new Date(v))]),
              dueDate: z
                .union([z.date(), z.string().transform((v) => (v ? new Date(v) : null))])
                .nullish(),
              currencyCode: z.string().optional(),
              /** Printed grand total (incl. VAT) in minor units — when set,
               *  overrides the sum-from-items reconstruction so imports don't
               *  drift from €36.97 → €37.01 due to VAT integer-cent math. */
              totalCents: z.number().int().nullish(),
              status: z
                .enum(["draft", "received", "overdue", "paid", "cancelled", "refunded"])
                .optional(),
              irpfRate: z.number().min(0).max(100).optional(),
              notes: z.string().nullish(),
              items: z
                .array(
                  z.object({
                    description: z.string().min(1),
                    quantity: z.number().positive(),
                    unitPriceCents: z.number().int(),
                    vatRate: z.number().min(0).max(100),
                  }),
                )
                .min(1),
            }),
          )
          .min(1)
          .max(500),
      }),
    )
    .output(z.object({ created: z.number(), skipped: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const existingContacts = await getContacts(ctx.user.id)
      const byTaxId = new Map(
        existingContacts.filter((c) => c.taxId).map((c) => [c.taxId!.trim(), c.id]),
      )
      const byName = new Map(
        existingContacts.map((c) => [normalizeName(c.name), c.id]),
      )

      // Batch-level dedupe: if the LLM returned two rows for the same
      // supplier + invoice number, keep the first only.
      const seenInBatch = new Set<string>()

      let created = 0
      let skipped = 0
      for (const p of input.purchases) {
        let contactId: string | null = null
        if (p.supplierName) {
          const trimmedTax = p.supplierTaxId?.trim() ?? null
          const matched =
            (trimmedTax && byTaxId.get(trimmedTax)) ??
            byName.get(normalizeName(p.supplierName)) ??
            null
          if (matched) {
            contactId = matched
          } else {
            const newContact = await createContact(ctx.user.id, {
              name: p.supplierName,
              email: null,
              phone: null,
              mobile: null,
              address: null,
              city: null,
              postalCode: null,
              province: null,
              country: null,
              taxId: trimmedTax,
              bankDetails: null,
              notes: null,
              role: "supplier",
              kind: "company",
            })
            if (newContact) {
              contactId = newContact.id
              if (trimmedTax) byTaxId.set(trimmedTax, newContact.id)
              byName.set(normalizeName(p.supplierName), newContact.id)
            }
          }
        }

        const batchKey = `${contactId ?? ""}::${p.supplierInvoiceNumber.trim().toLowerCase()}`
        if (seenInBatch.has(batchKey)) {
          skipped++
          continue
        }
        const dup = await findDuplicatePurchase(
          ctx.user.id,
          contactId,
          p.supplierInvoiceNumber,
        )
        if (dup) {
          skipped++
          continue
        }
        seenInBatch.add(batchKey)

        await createPurchase(ctx.user.id, {
          contactId,
          pdfFileId: p.pdfFileId ?? null,
          supplierInvoiceNumber: p.supplierInvoiceNumber,
          status: p.status ?? "received",
          issueDate: p.issueDate,
          dueDate: p.dueDate ?? null,
          currencyCode: p.currencyCode ?? "EUR",
          totalCents: p.totalCents ?? null,
          irpfRate: p.irpfRate ?? 0,
          notes: p.notes ?? null,
          items: p.items.map((it, idx) => ({
            productId: null,
            description: it.description,
            quantity: it.quantity,
            unitPrice: it.unitPriceCents,
            vatRate: it.vatRate,
            position: idx,
          })),
        })
        created++
      }
      return { created, skipped }
    }),
})
