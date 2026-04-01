import { createCallerFactory } from "./init"
import { appRouter } from "./router"
import { createTRPCContext } from "./context"

const createCaller = createCallerFactory(appRouter)

/**
 * Server-side tRPC caller for use in React Server Components and server actions.
 *
 * Usage:
 *   const trpc = await serverClient()
 *   const result = await trpc.someRouter.someProcedure({ ... })
 */
export async function serverClient() {
  const ctx = await createTRPCContext()
  return createCaller(ctx)
}
