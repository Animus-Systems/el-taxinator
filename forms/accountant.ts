import { z } from "zod"

export const accountantCommentSchema = z.object({
  entityType: z.string().min(1).max(128),
  entityId: z.string().min(1).max(128),
  body: z.string().trim().min(1).max(2000),
})

export type AccountantCommentInput = z.infer<typeof accountantCommentSchema>
