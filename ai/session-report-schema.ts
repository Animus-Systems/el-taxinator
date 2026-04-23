import { z } from "zod"
import { taxTipSchema, businessFactSchema } from "@/lib/db-types"
import type { SessionReport } from "./session-report"

const statusTotalSchema = z.object({
  count: z.number(),
  amount: z.number(),
})

const categoryTotalSchema = z.object({
  code: z.string(),
  name: z.string(),
  count: z.number(),
  amount: z.number(),
  taxFormRef: z.string().nullable(),
})

const taxRollupsSchema = z.object({
  disposalProceeds: z.number(),
  basisPurchases: z.number(),
  stakingRewards: z.number(),
  airdrops: z.number(),
  disposalCount: z.number(),
  pendingBasisCount: z.number(),
})

export const sessionReportSchema: z.ZodType<SessionReport> = z.object({
  session: z.object({
    id: z.string(),
    title: z.string().nullable(),
    entryMode: z.string(),
    fileName: z.string().nullable(),
    fileType: z.string().nullable(),
    createdAt: z.date(),
    committedAt: z.date().nullable(),
    status: z.string(),
    rowCount: z.number(),
    bankName: z.string().nullable(),
    commitCreatedCount: z.number().nullable(),
    commitErrors: z
      .array(z.object({ rowIndex: z.number(), message: z.string() }))
      .nullable(),
  }),
  user: z.object({
    businessName: z.string().nullable(),
    entityType: z.string().nullable(),
    nif: z.string().nullable(),
  }),
  totals: z.object({
    byStatus: z.record(z.string(), statusTotalSchema),
    byCategory: z.array(categoryTotalSchema),
    deductibleTotal: z.number(),
    nonDeductibleTotal: z.number(),
    personalTaxableTotal: z.number(),
    personalTotal: z.number(),
    internalTotal: z.number(),
    grandTotal: z.number(),
    currencyCode: z.string().nullable(),
  }),
  taxRollups: taxRollupsSchema,
  taxTipsCollected: z.array(taxTipSchema),
  businessFactsLearned: z.array(businessFactSchema),
  conversationDigest: z.array(
    z.object({
      role: z.string(),
      content: z.string(),
      createdAt: z.string(),
    }),
  ),
  generatedAt: z.date(),
  generatedBy: z.string(),
})
