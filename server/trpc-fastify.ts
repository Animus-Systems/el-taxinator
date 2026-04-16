import type { AnyRouter } from "@trpc/server"
import {
  fastifyRequestHandler,
  type FastifyHandlerOptions,
} from "@trpc/server/adapters/fastify"
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"

type RegisterFastifyTrpcRoutesOptions<TRouter extends AnyRouter> = {
  prefix: string
  router: TRouter
  createContext: NonNullable<
    FastifyHandlerOptions<TRouter, FastifyRequest, FastifyReply>["createContext"]
  >
  onError?: FastifyHandlerOptions<TRouter, FastifyRequest, FastifyReply>["onError"]
}

/**
 * Fastify's plugin-encapsulated `:path` route does not match comma-joined tRPC
 * batch URLs (e.g. `/api/trpc/a,b?batch=1...`). A wildcard route does.
 */
export async function registerFastifyTrpcRoutes<TRouter extends AnyRouter>(
  app: FastifyInstance,
  opts: RegisterFastifyTrpcRoutesOptions<TRouter>,
): Promise<void> {
  app.removeContentTypeParser("application/json")
  app.addContentTypeParser("application/json", { parseAs: "string" }, function (_req, body, done) {
    done(null, body)
  })

  app.all(`${opts.prefix}/*`, async (req, res) => {
    const path = typeof req.params === "object" && req.params !== null && "*" in req.params
      ? String(req.params["*"] ?? "")
      : ""

    const handlerOptions = {
      req,
      res,
      path,
      router: opts.router,
      createContext: opts.createContext,
    }

    if (opts.onError) {
      await fastifyRequestHandler({
        ...handlerOptions,
        onError: opts.onError,
      })
      return
    }

    await fastifyRequestHandler(handlerOptions)
  })
}
