import { createTRPCReact } from "@trpc/react-query"
import { httpBatchLink } from "@trpc/client"
import { QueryClient } from "@tanstack/react-query"
import superjson from "superjson"
import type { AppRouter } from "@/lib/trpc/router"

export const trpc = createTRPCReact<AppRouter>()

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      refetchOnWindowFocus: false,
      // Cover the ~1–3s window where Fastify is still booting embedded Postgres
      // after `yarn dev`. React Query's default is 3 retries with 1s/2s/4s
      // backoff; tighten the initial waits so the UI recovers faster without
      // masking genuine errors.
      retry: 4,
      retryDelay: (attempt) => Math.min(400 * 2 ** attempt, 3000),
    },
  },
})

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
    }),
  ],
})
