import { createOpenApiFetchHandler } from "trpc-to-openapi"
import { appRouter } from "@/lib/trpc/router"
import { createTRPCContext } from "@/lib/trpc/context"

const handler = (req: Request) =>
  createOpenApiFetchHandler({
    req,
    endpoint: "/api/v1",
    router: appRouter,
    createContext: () => createTRPCContext(),
  })

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as DELETE,
  handler as PATCH,
}
