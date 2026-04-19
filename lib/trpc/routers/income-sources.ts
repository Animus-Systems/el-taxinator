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
  listIncomeSourceYears,
  listTransactionsBySource,
  listUnlinkedDepositsForSource,
  setTransactionIncomeSource,
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

  availableYears: authedProcedure
    .input(z.object({ kind: kindSchema.optional() }).optional())
    .output(z.array(z.number().int()))
    .query(async ({ ctx, input }) => {
      return listIncomeSourceYears(ctx.user.id, input?.kind)
    }),

  detail: authedProcedure
    .input(z.object({ id: z.string(), year: z.number().int() }))
    .output(
      z.object({
        source: sourceSchema,
        transactions: z.array(
          z.object({
            id: z.string(),
            issuedAt: z.string(),
            name: z.string().nullable(),
            merchant: z.string().nullable(),
            description: z.string().nullable(),
            total: z.number(),
            currencyCode: z.string(),
            status: z.string().nullable(),
            fileIds: z.array(z.string()),
            grossCents: z.number().nullable(),
            irpfWithheldCents: z.number().nullable(),
            ssEmployeeCents: z.number().nullable(),
            payslipPeriodStart: z.string().nullable(),
            payslipPeriodEnd: z.string().nullable(),
            hasPayslip: z.boolean(),
          }),
        ),
        monthly: z.array(
          z.object({
            month: z.number().int().min(1).max(12),
            depositCount: z.number().int(),
            withPayslipCount: z.number().int(),
            grossCents: z.number(),
            netCents: z.number(),
            withheldCents: z.number(),
          }),
        ),
        completeness: z.object({
          missingNif: z.boolean(),
          monthsWithDeposits: z.number().int(),
          monthsMissingPayslip: z.number().int(),
          depositsMissingPayslip: z.number().int(),
          totalIrpfExtracted: z.boolean(),
        }),
      }),
    )
    .query(async ({ ctx, input }) => {
      const source = await getIncomeSourceById(input.id, ctx.user.id)
      if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "Income source not found" })

      const rawTxns = await listTransactionsBySource(ctx.user.id, input.id, input.year)
      const transactions = rawTxns.map((t) => ({
        ...t,
        // A "payslip" is either an AI-extracted payslip (extra.payslip present
        // → grossCents is set) or any attached PDF on a linked income row.
        hasPayslip: t.grossCents != null || t.fileIds.length > 0,
      }))

      // Roll up per calendar month so the UI can render a 12-dot grid.
      const buckets = new Map<
        number,
        { depositCount: number; withPayslipCount: number; grossCents: number; netCents: number; withheldCents: number }
      >()
      for (const t of transactions) {
        const month = new Date(t.issuedAt).getUTCMonth() + 1
        const b = buckets.get(month) ?? {
          depositCount: 0,
          withPayslipCount: 0,
          grossCents: 0,
          netCents: 0,
          withheldCents: 0,
        }
        b.depositCount += 1
        if (t.hasPayslip) b.withPayslipCount += 1
        b.grossCents += t.grossCents ?? t.total
        b.netCents += t.total
        b.withheldCents += t.irpfWithheldCents ?? 0
        buckets.set(month, b)
      }
      const monthly = Array.from({ length: 12 }, (_, i) => {
        const m = i + 1
        const b = buckets.get(m)
        return {
          month: m,
          depositCount: b?.depositCount ?? 0,
          withPayslipCount: b?.withPayslipCount ?? 0,
          grossCents: b?.grossCents ?? 0,
          netCents: b?.netCents ?? 0,
          withheldCents: b?.withheldCents ?? 0,
        }
      })

      const monthsWithDeposits = monthly.filter((m) => m.depositCount > 0).length
      const monthsMissingPayslip = monthly.filter(
        (m) => m.depositCount > 0 && m.withPayslipCount === 0,
      ).length
      const depositsMissingPayslip = transactions.filter((t) => !t.hasPayslip).length
      const totalIrpfExtracted = transactions.some(
        (t) => t.irpfWithheldCents != null && t.irpfWithheldCents > 0,
      )

      return {
        source,
        transactions,
        monthly,
        completeness: {
          missingNif: !source.taxId || source.taxId.trim() === "",
          monthsWithDeposits,
          monthsMissingPayslip,
          depositsMissingPayslip,
          totalIrpfExtracted,
        },
      }
    }),

  suggestLinks: authedProcedure
    .input(z.object({ id: z.string(), year: z.number().int() }))
    .output(
      z.array(
        z.object({
          id: z.string(),
          issuedAt: z.string(),
          merchant: z.string().nullable(),
          description: z.string().nullable(),
          total: z.number(),
          currencyCode: z.string(),
          status: z.string().nullable(),
          matchReason: z.enum(["merchant", "description"]),
        }),
      ),
    )
    .query(async ({ ctx, input }) => {
      const source = await getIncomeSourceById(input.id, ctx.user.id)
      if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "Income source not found" })
      return listUnlinkedDepositsForSource(
        ctx.user.id,
        { id: source.id, name: source.name },
        input.year,
      )
    }),

  linkTransaction: authedProcedure
    .input(z.object({ sourceId: z.string(), transactionId: z.string() }))
    .output(z.object({ ok: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const source = await getIncomeSourceById(input.sourceId, ctx.user.id)
      if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "Income source not found" })
      const ok = await setTransactionIncomeSource(ctx.user.id, input.transactionId, input.sourceId)
      if (!ok) throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" })
      return { ok: true }
    }),

  unlinkTransaction: authedProcedure
    .input(z.object({ transactionId: z.string() }))
    .output(z.object({ ok: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const ok = await setTransactionIncomeSource(ctx.user.id, input.transactionId, null)
      if (!ok) throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" })
      return { ok: true }
    }),
})
