import { z } from "zod"
import { router, authedProcedure } from "../init"
import {
  getUnsortedFiles,
  getUnsortedFilesCount,
  getFileById,
  getFiles,
  deleteFile,
} from "@/models/files"
import { fileSchema } from "@/lib/db-types"
import { getActiveEntityId } from "@/lib/entities"

const fileStatusFilterSchema = z.enum(["all", "unreviewed", "linked", "orphan"])

const fileWithLinkSchema = fileSchema.extend({
  linkedTransactionId: z.string().nullable(),
  linkedTransactionName: z.string().nullable(),
  linkedInvoiceId: z.string().nullable(),
  linkedInvoiceNumber: z.string().nullable(),
})

const filesListOutputSchema = z.object({
  files: z.array(fileWithLinkSchema),
  total: z.number().int(),
})

export const filesRouter = router({
  listUnsorted: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/files/unsorted" } })
    .input(z.object({}))
    .output(z.array(fileSchema))
    .query(async ({ ctx }) => {
      return getUnsortedFiles(ctx.user.id)
    }),

  list: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/files" } })
    .input(
      z.object({
        status: fileStatusFilterSchema.default("all"),
        search: z.string().default(""),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(200).default(50),
      }),
    )
    .output(filesListOutputSchema)
    .query(async ({ ctx, input }) => {
      return getFiles(ctx.user.id, input)
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
