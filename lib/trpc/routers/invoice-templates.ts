import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { router, authedProcedure } from "../init"
import {
  listTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  setDefaultTemplate,
  duplicateTemplate,
} from "@/models/invoice-templates"
import type { InvoiceTemplateData } from "@/models/invoice-templates"
import {
  invoiceTemplateSchema,
  invoiceTemplateLabelsSchema,
  logoPositionSchema,
  fontPresetSchema,
  templateLanguageSchema,
} from "@/lib/db-types"

const templateInputSchema = z.object({
  name: z.string().min(1).max(100),
  isDefault: z.boolean().optional(),
  logoFileId: z.string().nullish(),
  logoPosition: logoPositionSchema.optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  fontPreset: fontPresetSchema.optional(),
  headerText: z.string().nullish(),
  footerText: z.string().nullish(),
  bankDetailsText: z.string().nullish(),
  businessDetailsText: z.string().nullish(),
  belowTotalsText: z.string().nullish(),
  showProminentTotal: z.boolean().optional(),
  showVatColumn: z.boolean().optional(),
  labels: invoiceTemplateLabelsSchema.nullish(),
  showBankDetails: z.boolean().optional(),
  paymentTermsDays: z.number().int().min(0).max(365).nullish(),
  language: templateLanguageSchema.optional(),
})

function toTemplateData(input: z.infer<typeof templateInputSchema>): InvoiceTemplateData {
  const data: InvoiceTemplateData = { name: input.name }
  if (input.isDefault !== undefined) data.isDefault = input.isDefault
  if (input.logoFileId !== undefined) data.logoFileId = input.logoFileId ?? null
  if (input.logoPosition !== undefined) data.logoPosition = input.logoPosition
  if (input.accentColor !== undefined) data.accentColor = input.accentColor
  if (input.fontPreset !== undefined) data.fontPreset = input.fontPreset
  if (input.headerText !== undefined) data.headerText = input.headerText ?? null
  if (input.footerText !== undefined) data.footerText = input.footerText ?? null
  if (input.bankDetailsText !== undefined) data.bankDetailsText = input.bankDetailsText ?? null
  if (input.businessDetailsText !== undefined) data.businessDetailsText = input.businessDetailsText ?? null
  if (input.belowTotalsText !== undefined) data.belowTotalsText = input.belowTotalsText ?? null
  if (input.showProminentTotal !== undefined) data.showProminentTotal = input.showProminentTotal
  if (input.showVatColumn !== undefined) data.showVatColumn = input.showVatColumn
  if (input.labels !== undefined) data.labels = input.labels ?? null
  if (input.showBankDetails !== undefined) data.showBankDetails = input.showBankDetails
  if (input.paymentTermsDays !== undefined) data.paymentTermsDays = input.paymentTermsDays ?? null
  if (input.language !== undefined) data.language = input.language
  return data
}

export const invoiceTemplatesRouter = router({
  list: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/invoice-templates" } })
    .input(z.object({}).optional())
    .output(z.array(invoiceTemplateSchema))
    .query(async ({ ctx }) => {
      return listTemplates(ctx.user.id)
    }),

  getById: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/invoice-templates/{id}" } })
    .input(z.object({ id: z.string() }))
    .output(invoiceTemplateSchema.nullable())
    .query(async ({ ctx, input }) => {
      return getTemplateById(input.id, ctx.user.id)
    }),

  create: authedProcedure
    .meta({ openapi: { method: "POST", path: "/api/v1/invoice-templates" } })
    .input(templateInputSchema)
    .output(invoiceTemplateSchema)
    .mutation(async ({ ctx, input }) => {
      return createTemplate(ctx.user.id, toTemplateData(input))
    }),

  update: authedProcedure
    .meta({ openapi: { method: "PUT", path: "/api/v1/invoice-templates/{id}" } })
    .input(z.object({ id: z.string() }).merge(templateInputSchema))
    .output(invoiceTemplateSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input
      const updated = await updateTemplate(id, ctx.user.id, toTemplateData(rest))
      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" })
      }
      return updated
    }),

  delete: authedProcedure
    .meta({ openapi: { method: "DELETE", path: "/api/v1/invoice-templates/{id}" } })
    .input(z.object({ id: z.string() }))
    .output(invoiceTemplateSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return deleteTemplate(input.id, ctx.user.id)
    }),

  setDefault: authedProcedure
    .meta({ openapi: { method: "POST", path: "/api/v1/invoice-templates/{id}/default" } })
    .input(z.object({ id: z.string() }))
    .output(invoiceTemplateSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      const updated = await setDefaultTemplate(input.id, ctx.user.id)
      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" })
      }
      return updated
    }),

  duplicate: authedProcedure
    .meta({ openapi: { method: "POST", path: "/api/v1/invoice-templates/{id}/duplicate" } })
    .input(z.object({ id: z.string() }))
    .output(invoiceTemplateSchema)
    .mutation(async ({ ctx, input }) => {
      const copy = await duplicateTemplate(input.id, ctx.user.id)
      if (!copy) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" })
      }
      return copy
    }),
})
