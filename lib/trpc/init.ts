import { initTRPC, TRPCError } from "@trpc/server"
import superjson from "superjson"
import type { OpenApiMeta } from "trpc-to-openapi"
import type { TRPCContext } from "./context"

const t = initTRPC
  .meta<OpenApiMeta>()
  .context<TRPCContext>()
  .create({
    transformer: superjson,
    errorFormatter({ shape }) {
      return shape
    },
  })

export const router = t.router
export const publicProcedure = t.procedure
export const createCallerFactory = t.createCallerFactory

/**
 * Middleware that enforces authentication.
 * Throws UNAUTHORIZED if no user is present in the context.
 */
const enforceAuth = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" })
  }
  return next({ ctx: { ...ctx, user: ctx.user } })
})

export const authedProcedure = t.procedure.use(enforceAuth)
