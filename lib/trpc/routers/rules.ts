import { z } from "zod"
import { router, authedProcedure } from "../init"
import {
  getRules,
  getActiveRules,
  createRule,
  updateRule,
  deleteRule,
  toggleRuleActive,
} from "@/models/rules"
import { categorizationRuleSchema } from "@/lib/db-types"

const ruleInputSchema = z.object({
  name: z.string().min(1).max(128),
  matchType: z.enum(["contains", "starts_with", "exact", "regex"]).default("contains"),
  matchField: z.enum(["name", "merchant", "description"]).default("name"),
  matchValue: z.string().min(1).max(256),
  categoryCode: z.string().max(64).nullish(),
  projectCode: z.string().max(64).nullish(),
  type: z.enum(["expense", "income"]).nullish(),
  status: z.enum(["business", "business_non_deductible", "personal_ignored"]).nullish(),
  note: z.string().max(512).nullish(),
  priority: z.coerce.number().int().min(0).max(1000).default(0),
})

const ruleUpdateSchema = ruleInputSchema.partial()

export const rulesRouter = router({
  list: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/rules" } })
    .input(z.object({}))
    .output(z.array(categorizationRuleSchema))
    .query(async ({ ctx }) => {
      return getRules(ctx.user.id)
    }),

  listActive: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/rules/active" } })
    .input(z.object({}))
    .output(z.array(categorizationRuleSchema))
    .query(async ({ ctx }) => {
      return getActiveRules(ctx.user.id)
    }),

  create: authedProcedure
    .meta({ openapi: { method: "POST", path: "/api/v1/rules" } })
    .input(ruleInputSchema)
    .output(categorizationRuleSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return createRule(ctx.user.id, input)
    }),

  update: authedProcedure
    .meta({ openapi: { method: "PUT", path: "/api/v1/rules/{id}" } })
    .input(z.object({ id: z.string() }).merge(ruleUpdateSchema))
    .output(categorizationRuleSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      return updateRule(id, ctx.user.id, data)
    }),

  delete: authedProcedure
    .meta({ openapi: { method: "DELETE", path: "/api/v1/rules/{id}" } })
    .input(z.object({ id: z.string() }))
    .output(categorizationRuleSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return deleteRule(input.id, ctx.user.id)
    }),

  toggleActive: authedProcedure
    .meta({ openapi: { method: "PATCH", path: "/api/v1/rules/{id}/toggle" } })
    .input(z.object({ id: z.string(), isActive: z.boolean() }))
    .output(categorizationRuleSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return toggleRuleActive(input.id, ctx.user.id, input.isActive)
    }),
})
