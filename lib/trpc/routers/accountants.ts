import { z } from "zod"
import { router, authedProcedure } from "../init"
import {
  getAccountantInvites,
  createAccountantInvite,
  revokeAccountantInvite,
  deleteAccountantInvite,
} from "@/models/accountants"
import type { AccountantInviteData } from "@/models/accountants"
import { accountantInviteSchema } from "@/lib/db-types"

const permissionsSchema = z.object({
  transactions: z.boolean().default(true),
  invoices: z.boolean().default(true),
  tax: z.boolean().default(true),
  time: z.boolean().default(false),
})

const inviteInputSchema = z.object({
  name: z.string().min(1).max(128),
  email: z.string().email().nullish(),
  permissions: permissionsSchema.optional(),
  expiresAt: z.union([z.date(), z.string().transform((v) => new Date(v))]).nullish(),
})

// Invite with _count for access logs and comments
const accountantInviteWithCountsSchema = accountantInviteSchema.extend({
  _count: z.object({
    accessLogs: z.number(),
    comments: z.number(),
  }),
}).passthrough()

export const accountantsRouter = router({
  listInvites: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/accountant/invites" } })
    .input(z.object({}))
    .output(z.array(accountantInviteWithCountsSchema))
    .query(async ({ ctx }) => {
      return getAccountantInvites(ctx.user.id)
    }),

  createInvite: authedProcedure
    .meta({ openapi: { method: "POST", path: "/api/v1/accountant/invites" } })
    .input(inviteInputSchema)
    .output(accountantInviteSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return createAccountantInvite(ctx.user.id, input as AccountantInviteData)
    }),

  revokeInvite: authedProcedure
    .meta({ openapi: { method: "POST", path: "/api/v1/accountant/invites/{id}/revoke" } })
    .input(z.object({ id: z.string() }))
    .output(accountantInviteSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return revokeAccountantInvite(input.id, ctx.user.id)
    }),

  deleteInvite: authedProcedure
    .meta({ openapi: { method: "DELETE", path: "/api/v1/accountant/invites/{id}" } })
    .input(z.object({ id: z.string() }))
    .output(accountantInviteSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return deleteAccountantInvite(input.id, ctx.user.id)
    }),
})
