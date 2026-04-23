import { initTRPC, TRPCError } from "@trpc/server"
import superjson from "superjson"
import type { OpenApiMeta } from "trpc-to-openapi"
import type { TRPCContext } from "./context"
import { sanitizeError } from "@/lib/error-sanitizer"

/**
 * Pure sanitizer used by the errorFormatter below — also exported so tests
 * can exercise it without booting the whole tRPC pipeline (createCaller
 * bypasses errorFormatter).
 */
export function sanitizeTrpcMessage(
  code: string,
  cause: unknown,
  originalMessage: string,
): string {
  const isInternal =
    code === "INTERNAL_SERVER_ERROR" ||
    (cause instanceof Error && !(cause instanceof TRPCError))
  if (!isInternal) return originalMessage
  return sanitizeError(cause ?? originalMessage)
}

const t = initTRPC
  .meta<OpenApiMeta>()
  .context<TRPCContext>()
  .create({
    transformer: superjson,
    errorFormatter({ shape, error }) {
      return { ...shape, message: sanitizeTrpcMessage(error.code, error.cause, shape.message) }
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
