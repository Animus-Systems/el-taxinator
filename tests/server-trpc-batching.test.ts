import Fastify from "fastify"
import { describe, expect, it } from "vitest"

import { appRouter } from "@/lib/trpc/router"
import { registerFastifyTrpcRoutes } from "@/server/trpc-fastify"

describe("server tRPC batching", () => {
  it("accepts comma-joined batch procedure paths", async () => {
    const app = Fastify()

    await registerFastifyTrpcRoutes(app, {
      prefix: "/api/trpc",
      router: appRouter,
      createContext: async () => ({ user: null, req: null }),
    })

    await app.ready()

    const response = await app.inject({
      method: "GET",
      url:
        "/api/trpc/knowledge.list,knowledge.list?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%2C%22meta%22%3A%7B%22values%22%3A%5B%22undefined%22%5D%2C%22v%22%3A1%7D%7D%2C%221%22%3A%7B%22json%22%3Anull%2C%22meta%22%3A%7B%22values%22%3A%5B%22undefined%22%5D%2C%22v%22%3A1%7D%7D%7D",
    })

    expect(response.statusCode).not.toBe(404)
    expect(response.statusCode).toBe(401)

    await app.close()
  })
})
