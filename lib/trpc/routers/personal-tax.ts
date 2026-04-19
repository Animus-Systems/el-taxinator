import { z } from "zod"
import { router, authedProcedure } from "../init"
import { computePersonalTaxEstimate } from "@/models/personal-tax-estimate"

const estimateSchema = z.object({
  year: z.number().int(),
  salaryGrossCents: z.number(),
  salaryWithheldCents: z.number(),
  rentalGrossCents: z.number(),
  dividendGrossCents: z.number(),
  dividendWithheldCents: z.number(),
  interestGrossCents: z.number(),
  interestWithheldCents: z.number(),
  cryptoRealizedGainCents: z.number(),
  deductionBaseReductionCents: z.number(),
  deductionCuotaCreditCents: z.number(),
  generalBaseCents: z.number(),
  savingsBaseCents: z.number(),
  generalCuotaCents: z.number(),
  savingsCuotaCents: z.number(),
  cuotaIntegraCents: z.number(),
  cuotaLiquidaCents: z.number(),
  totalWithheldCents: z.number(),
  resultCents: z.number(),
})

export const personalTaxRouter = router({
  estimate: authedProcedure
    .input(z.object({ year: z.number().int() }))
    .output(estimateSchema)
    .query(async ({ ctx, input }) => {
      return computePersonalTaxEstimate(ctx.user.id, input.year)
    }),
})
