import { z } from "zod"
import { router, authedProcedure } from "../init"
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "@/models/categories"
import { categorySchema } from "@/lib/db-types"

const categoryInputSchema = z.object({
  name: z.string().max(128),
  llmPrompt: z.string().max(512).nullish(),
  color: z.string().max(7).nullish(),
})

export const categoriesRouter = router({
  list: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/categories" } })
    .input(z.object({}))
    .output(z.array(categorySchema))
    .query(async ({ ctx }) => {
      return getCategories(ctx.user.id)
    }),

  create: authedProcedure
    .meta({ openapi: { method: "POST", path: "/api/v1/categories" } })
    .input(categoryInputSchema)
    .output(categorySchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return createCategory(ctx.user.id, input)
    }),

  update: authedProcedure
    .meta({ openapi: { method: "PUT", path: "/api/v1/categories/{code}" } })
    .input(z.object({ code: z.string() }).merge(categoryInputSchema))
    .output(categorySchema.nullable())
    .mutation(async ({ ctx, input }) => {
      const { code, ...data } = input
      return updateCategory(ctx.user.id, code, data)
    }),

  delete: authedProcedure
    .meta({ openapi: { method: "DELETE", path: "/api/v1/categories/{code}" } })
    .input(z.object({ code: z.string() }))
    .output(categorySchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return deleteCategory(ctx.user.id, input.code)
    }),
})
