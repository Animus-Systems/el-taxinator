import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { router, authedProcedure } from "../init"
import {
  listDeductions,
  getDeductionById,
  createDeduction,
  updateDeduction,
  deleteDeduction,
  sumDeductionsForYear,
} from "@/models/personal-deductions"

const kindSchema = z.enum(["pension", "mortgage", "donation", "family", "regional", "other"])

const deductionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  kind: kindSchema,
  taxYear: z.number().int(),
  amountCents: z.number(),
  description: z.string().nullable(),
  fileId: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.date(),
  updatedAt: z.date(),
})

const inputSchema = z.object({
  kind: kindSchema,
  taxYear: z.number().int(),
  amountCents: z.number().int().nonnegative(),
  description: z.string().nullish(),
  fileId: z.string().nullish(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export const deductionsRouter = router({
  list: authedProcedure
    .input(z.object({ taxYear: z.number().int() }))
    .output(z.array(deductionSchema))
    .query(async ({ ctx, input }) => {
      return listDeductions(ctx.user.id, input.taxYear)
    }),

  getById: authedProcedure
    .input(z.object({ id: z.string() }))
    .output(deductionSchema.nullable())
    .query(async ({ ctx, input }) => {
      return getDeductionById(input.id, ctx.user.id)
    }),

  create: authedProcedure
    .input(inputSchema)
    .output(deductionSchema)
    .mutation(async ({ ctx, input }) => {
      return createDeduction(ctx.user.id, {
        kind: input.kind,
        taxYear: input.taxYear,
        amountCents: input.amountCents,
        description: input.description ?? null,
        fileId: input.fileId ?? null,
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      })
    }),

  update: authedProcedure
    .input(z.object({ id: z.string() }).merge(inputSchema.partial()))
    .output(deductionSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      const updated = await updateDeduction(id, ctx.user.id, data)
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Deduction not found" })
      return updated
    }),

  delete: authedProcedure
    .input(z.object({ id: z.string() }))
    .output(z.object({ ok: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const ok = await deleteDeduction(input.id, ctx.user.id)
      if (!ok) throw new TRPCError({ code: "NOT_FOUND", message: "Deduction not found" })
      return { ok: true }
    }),

  totalsForYear: authedProcedure
    .input(z.object({ taxYear: z.number().int() }))
    .output(z.object({
      baseReductionCents: z.number(),
      cuotaCreditCents: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      return sumDeductionsForYear(ctx.user.id, input.taxYear)
    }),
})
