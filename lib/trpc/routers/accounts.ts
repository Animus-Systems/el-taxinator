import { z } from "zod"
import { router, authedProcedure } from "../init"
import {
  getAccounts,
  getActiveAccounts,
  getAccountById,
  createAccount,
  updateAccount,
  deleteAccount,
} from "@/models/accounts"
import type { AccountData } from "@/models/accounts"
import { accountTypeSchema, bankAccountSchema } from "@/lib/db-types"

const accountInputSchema = z.object({
  name: z.string().min(1).max(256),
  bankName: z.string().max(256).nullish(),
  currencyCode: z.string().min(1).max(10),
  accountNumber: z.string().max(64).nullish(),
  notes: z.string().max(1024).nullish(),
  accountType: accountTypeSchema.optional(),
  isActive: z.boolean().optional(),
})

export const accountsRouter = router({
  list: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/accounts" } })
    .input(z.object({}))
    .output(z.array(bankAccountSchema))
    .query(async ({ ctx }) => {
      return getAccounts(ctx.user.id)
    }),

  listActive: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/accounts/active" } })
    .input(z.object({}))
    .output(z.array(bankAccountSchema))
    .query(async ({ ctx }) => {
      return getActiveAccounts(ctx.user.id)
    }),

  getById: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/accounts/{id}" } })
    .input(z.object({ id: z.string() }))
    .output(bankAccountSchema.nullable())
    .query(async ({ ctx, input }) => {
      return getAccountById(input.id, ctx.user.id)
    }),

  create: authedProcedure
    .meta({ openapi: { method: "POST", path: "/api/v1/accounts" } })
    .input(accountInputSchema)
    .output(bankAccountSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return createAccount(ctx.user.id, input as AccountData)
    }),

  update: authedProcedure
    .meta({ openapi: { method: "PUT", path: "/api/v1/accounts/{id}" } })
    .input(z.object({ id: z.string() }).merge(accountInputSchema.partial()))
    .output(bankAccountSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      return updateAccount(id, ctx.user.id, data as Partial<AccountData>)
    }),

  delete: authedProcedure
    .meta({ openapi: { method: "DELETE", path: "/api/v1/accounts/{id}" } })
    .input(z.object({ id: z.string() }))
    .output(bankAccountSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return deleteAccount(input.id, ctx.user.id)
    }),
})
