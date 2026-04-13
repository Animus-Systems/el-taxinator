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
