import { z } from "zod"
import { router, authedProcedure } from "../init"
import {
  getProgressById,
  getOrCreateProgress,
} from "@/models/progress"
import { progressSchema } from "@/lib/db-types"

export const progressRouter = router({
  get: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/progress/{id}" } })
    .input(z.object({ id: z.string() }))
    .output(progressSchema.nullable())
    .query(async ({ ctx, input }) => {
      return getProgressById(ctx.user.id, input.id)
    }),

  create: authedProcedure
    .meta({ openapi: { method: "POST", path: "/api/v1/progress" } })
    .input(
      z.object({
        id: z.string(),
        type: z.string().nullish(),
        data: z.unknown().nullish(),
        total: z.number().int().default(0),
      }),
    )
    .output(progressSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return getOrCreateProgress(
        ctx.user.id,
        input.id,
        input.type ?? null,
        input.data ?? null,
        input.total,
      )
    }),
})
