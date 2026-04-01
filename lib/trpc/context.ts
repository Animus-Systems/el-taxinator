import { getSession } from "@/lib/auth"
import type { User } from "@/lib/db-types"

export type TRPCContext = {
  user: User | null
}

/**
 * Creates the tRPC context from the current request session.
 *
 * The session user from better-auth is compatible with our db-types User
 * shape, so we pass it through directly. If no session exists the user
 * will be null and authedProcedure will reject the request.
 */
export async function createTRPCContext(): Promise<TRPCContext> {
  const session = await getSession()

  return {
    user: (session?.user as User | undefined) ?? null,
  }
}
