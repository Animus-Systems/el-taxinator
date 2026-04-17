import { z } from "zod"
import { router, authedProcedure } from "../init"
import {
  getFields,
  createField,
  updateField,
  deleteField,
} from "@/models/fields"
import { fieldSchema } from "@/lib/db-types"

const fieldInputSchema = z.object({
  name: z.string().max(128),
  type: z.string().max(128).default("string"),
  llmPrompt: z.string().max(512).nullish(),
  options: z.any().nullish(),
  isVisibleInList: z.boolean().optional(),
  isVisibleInAnalysis: z.boolean().optional(),
  isRequired: z.boolean().optional(),
  isExtra: z.boolean().optional(),
})

const fieldUpdateSchema = z.object({
  code: z.string(),
  name: z.string().max(128).optional(),
  type: z.string().max(128).optional(),
  llmPrompt: z.string().max(512).nullish(),
  options: z.any().nullish(),
  isVisibleInList: z.boolean().optional(),
  isVisibleInAnalysis: z.boolean().optional(),
  isRequired: z.boolean().optional(),
  isExtra: z.boolean().optional(),
})

export const fieldsRouter = router({
  list: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/fields" } })
    .input(z.object({}))
    .output(z.array(fieldSchema))
    .query(async ({ ctx }) => {
      return getFields(ctx.user.id)
    }),

  create: authedProcedure
    .meta({ openapi: { method: "POST", path: "/api/v1/fields" } })
    .input(fieldInputSchema)
    .output(fieldSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return createField(ctx.user.id, input)
    }),

  update: authedProcedure
    .meta({ openapi: { method: "PUT", path: "/api/v1/fields/{code}" } })
    .input(fieldUpdateSchema)
    .output(fieldSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      const { code, ...data } = input
      return updateField(ctx.user.id, code, data)
    }),

  delete: authedProcedure
    .meta({ openapi: { method: "DELETE", path: "/api/v1/fields/{code}" } })
    .input(z.object({ code: z.string() }))
    .output(fieldSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return deleteField(ctx.user.id, input.code)
    }),
})
