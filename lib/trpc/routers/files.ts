import { z } from "zod"
import { router, authedProcedure } from "../init"
import {
  getUnsortedFiles,
  getUnsortedFilesCount,
  getFileById,
  deleteFile,
} from "@/models/files"
import { fileSchema } from "@/lib/db-types"
import { getActiveEntityId } from "@/lib/entities"

export const filesRouter = router({
  listUnsorted: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/files/unsorted" } })
    .input(z.object({}))
    .output(z.array(fileSchema))
    .query(async ({ ctx }) => {
      return getUnsortedFiles(ctx.user.id)
    }),

  unsortedCount: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/files/unsorted/count" } })
    .input(z.object({}))
    .output(z.object({ count: z.number() }))
    .query(async ({ ctx }) => {
      const count = await getUnsortedFilesCount(ctx.user.id)
      return { count }
    }),

  getById: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/files/{id}" } })
    .input(z.object({ id: z.string() }))
    .output(fileSchema.nullable())
    .query(async ({ ctx, input }) => {
      return getFileById(input.id, ctx.user.id)
    }),

  delete: authedProcedure
    .meta({ openapi: { method: "DELETE", path: "/api/v1/files/{id}" } })
    .input(z.object({ id: z.string() }))
    .output(fileSchema.passthrough().optional())
    .mutation(async ({ ctx, input }) => {
      const entityId = await getActiveEntityId()
      return deleteFile(input.id, ctx.user.id, entityId)
    }),
})
