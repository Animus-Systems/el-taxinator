import { z } from "zod"
import { router, authedProcedure } from "../init"
import {
  getCurrencies,
  createCurrency,
  updateCurrency,
  deleteCurrency,
} from "@/models/currencies"
import type { CurrencyCreateInput } from "@/lib/db-types"
import { currencySchema } from "@/lib/db-types"

const currencyInputSchema = z.object({
  code: z.string().max(5),
  name: z.string().max(32),
})

export const currenciesRouter = router({
  list: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/currencies" } })
    .input(z.object({}))
    .output(z.array(currencySchema))
    .query(async ({ ctx }) => {
      return getCurrencies(ctx.user.id)
    }),

  create: authedProcedure
    .meta({ openapi: { method: "POST", path: "/api/v1/currencies" } })
    .input(currencyInputSchema)
    .output(currencySchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return createCurrency(ctx.user.id, input as CurrencyCreateInput)
    }),

  update: authedProcedure
    .meta({ openapi: { method: "PUT", path: "/api/v1/currencies/{code}" } })
    .input(z.object({ code: z.string(), name: z.string().max(32) }))
    .output(currencySchema.nullable())
    .mutation(async ({ ctx, input }) => {
      const { code, ...data } = input
      return updateCurrency(ctx.user.id, code, data)
    }),

  delete: authedProcedure
    .meta({ openapi: { method: "DELETE", path: "/api/v1/currencies/{code}" } })
    .input(z.object({ code: z.string() }))
    .output(currencySchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return deleteCurrency(ctx.user.id, input.code)
    }),
})
