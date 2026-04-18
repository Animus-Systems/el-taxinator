import { z } from "zod"
import { router, authedProcedure } from "../init"
import {
  listFilings,
  getFiling,
  upsertFiling,
  clearFiling,
} from "@/models/tax-filings"
import { taxFilingSchema } from "@/lib/db-types"
import type { TaxFilingPatch } from "@/models/tax-filings"

// `filedAt` is tri-state on input: absent (don't change), null (mark unfiled),
// or Date (mark filed). tRPC/superjson transports Date natively on the server
// caller path; the REST/JSON path relies on Zod coercion which we allow via a
// union.
const filedAtInputSchema = z
  .union([z.date(), z.string().transform((v) => new Date(v)), z.null()])

const upsertInputSchema = z.object({
  year: z.number().int(),
  quarter: z.number().int().nullable(),
  modeloCode: z.string().min(1).max(32),
  filedAt: filedAtInputSchema.optional(),
  checklist: z.record(z.string(), z.boolean()).optional(),
  notes: z.string().max(2000).nullable().optional(),
  filedAmountCents: z.number().int().nullable().optional(),
  confirmationNumber: z.string().max(128).nullable().optional(),
  filingSource: z.enum(["app", "external"]).nullable().optional(),
})

export const taxFilingsRouter = router({
  list: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/tax-filings" } })
    .input(z.object({ year: z.number().int() }))
    .output(z.array(taxFilingSchema))
    .query(async ({ ctx, input }) => {
      return listFilings(ctx.user.id, input.year)
    }),

  get: authedProcedure
    .input(
      z.object({
        year: z.number().int(),
        quarter: z.number().int().nullable(),
        modeloCode: z.string().min(1).max(32),
      }),
    )
    .output(taxFilingSchema.nullable())
    .query(async ({ ctx, input }) => {
      return getFiling(ctx.user.id, input.year, input.quarter, input.modeloCode)
    }),

  upsert: authedProcedure
    .input(upsertInputSchema)
    .output(taxFilingSchema)
    .mutation(async ({ ctx, input }) => {
      // Build patch with only the fields the caller explicitly provided.
      // `exactOptionalPropertyTypes` means we cannot assign `undefined` to
      // an optional field, so we spread conditionally.
      const patch: TaxFilingPatch = {
        ...(input.filedAt !== undefined && { filedAt: input.filedAt }),
        ...(input.checklist !== undefined && { checklist: input.checklist }),
        ...(input.notes !== undefined && { notes: input.notes }),
        ...(input.filedAmountCents !== undefined && { filedAmountCents: input.filedAmountCents }),
        ...(input.confirmationNumber !== undefined && { confirmationNumber: input.confirmationNumber }),
        ...(input.filingSource !== undefined && { filingSource: input.filingSource }),
      }
      return upsertFiling(
        ctx.user.id,
        input.year,
        input.quarter,
        input.modeloCode,
        patch,
      )
    }),

  clear: authedProcedure
    .input(
      z.object({
        year: z.number().int(),
        quarter: z.number().int().nullable(),
        modeloCode: z.string().min(1).max(32),
      }),
    )
    .output(z.object({ ok: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await clearFiling(ctx.user.id, input.year, input.quarter, input.modeloCode)
      return { ok: true }
    }),
})
