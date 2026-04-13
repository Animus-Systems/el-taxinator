/**
 * Compatibility shim for @/lib/trpc/server-client.
 *
 * In the SPA, there is no server-side tRPC caller.
 * This shim exists so that action files (which import serverClient)
 * can be loaded without crashing. The functions will throw at call time.
 */

export async function serverClient(): Promise<never> {
  throw new Error(
    "serverClient() is a server-only function. " +
      "In the SPA, use tRPC hooks (trpc.x.y.useQuery / useMutation) instead."
  )
}
