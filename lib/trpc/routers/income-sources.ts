import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { router, authedProcedure } from "../init"
import {
  listIncomeSources,
  getIncomeSourceById,
  createIncomeSource,
  updateIncomeSource,
  deleteIncomeSource,
  getIncomeSourceTotals,
} from "@/models/income-sources"
import type { IncomeSource } from "@/models/income-sources"
import { getActiveEntityId, getEntityById } from "@/lib/entities"
import {
  forgetSharedIncomeSource,
  listSharedIncomeSources,
  recordSharedIncomeSource,
} from "@/lib/shared-income-sources"

const kindSchema = z.enum(["salary", "rental", "dividend", "interest", "other"])

async function syncShared(src: IncomeSource): Promise<void> {
  try {
    const entityId = await getActiveEntityId()
    const entity = getEntityById(entityId)
    recordSharedIncomeSource({
      entityId,
      entityName: entity?.name ?? entityId,
      id: src.id,
      kind: src.kind,
      name: src.name,
      taxId: src.taxId,
      metadata: src.metadata,
      updatedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.warn("[incomeSources] shared sync failed:", err)
  }
}

async function dropShared(id: string): Promise<void> {
  try {
    const entityId = await getActiveEntityId()
    forgetSharedIncomeSource(entityId, id)
  } catch (err) {
    console.warn("[incomeSources] shared drop failed:", err)
  }
}

const sourceSchema = z.object({
  id: z.string(),
  userId: z.string(),
  kind: kindSchema,
  name: z.string(),
  taxId: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

const inputSchema = z.object({
  kind: kindSchema,
  name: z.string().min(1),
  taxId: z.string().nullish(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().optional(),
})

export const incomeSourcesRouter = router({
  list: authedProcedure
    .input(z.object({ kind: kindSchema.optional() }))
    .output(z.array(sourceSchema))
    .query(async ({ ctx, input }) => {
      return listIncomeSources(ctx.user.id, input.kind)
    }),

  getById: authedProcedure
    .input(z.object({ id: z.string() }))
    .output(sourceSchema.nullable())
    .query(async ({ ctx, input }) => {
      return getIncomeSourceById(input.id, ctx.user.id)
    }),

  create: authedProcedure
    .input(inputSchema)
    .output(sourceSchema)
    .mutation(async ({ ctx, input }) => {
      const created = await createIncomeSource(ctx.user.id, {
        kind: input.kind,
        name: input.name,
        taxId: input.taxId ?? null,
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      })
      await syncShared(created)
      return created
    }),

  update: authedProcedure
    .input(z.object({ id: z.string() }).merge(inputSchema.partial()))
    .output(sourceSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      const updated = await updateIncomeSource(id, ctx.user.id, data)
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Income source not found" })
      await syncShared(updated)
      return updated
    }),

  delete: authedProcedure
    .input(z.object({ id: z.string() }))
    .output(z.object({ ok: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const ok = await deleteIncomeSource(input.id, ctx.user.id)
      if (!ok) throw new TRPCError({ code: "NOT_FOUND", message: "Income source not found" })
      await dropShared(input.id)
      return { ok: true }
    }),

  listFromOtherProfiles: authedProcedure
    .input(z.object({ kind: kindSchema.optional() }))
    .output(z.array(z.object({
      entityId: z.string(),
      entityName: z.string(),
      id: z.string(),
      kind: kindSchema,
      name: z.string(),
      taxId: z.string().nullable(),
      metadata: z.record(z.string(), z.unknown()),
      updatedAt: z.string(),
    })))
    .query(async ({ input }) => {
      const currentEntityId = await getActiveEntityId()
      return listSharedIncomeSources({
        excludeEntityId: currentEntityId,
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
      })
    }),

  totals: authedProcedure
    .input(z.object({ year: z.number().int() }))
    .output(z.array(z.object({
      sourceId: z.string(),
      grossCents: z.number(),
      netCents: z.number(),
      withheldCents: z.number(),
    })))
    .query(async ({ ctx, input }) => {
      return getIncomeSourceTotals(ctx.user.id, input.year)
    }),
})
