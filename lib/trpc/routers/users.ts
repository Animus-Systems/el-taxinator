import { z } from "zod"
import { router, authedProcedure } from "../init"
import { getUserById, updateUser } from "@/models/users"
import { userSchema } from "@/lib/db-types"

export const usersRouter = router({
  me: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/users/me" } })
    .input(z.object({}))
    .output(userSchema.nullable())
    .query(async ({ ctx }) => {
      return getUserById(ctx.user.id)
    }),

  update: authedProcedure
    .meta({ openapi: { method: "PUT", path: "/api/v1/users/me" } })
    .input(
      z.object({
        name: z.string().max(128).optional(),
        businessName: z.string().max(128).nullish(),
        businessAddress: z.string().max(1024).nullish(),
        businessBankDetails: z.string().max(1024).nullish(),
        businessTaxId: z.string().max(64).nullish(),
      }),
    )
    .output(userSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return updateUser(ctx.user.id, input)
    }),
})
