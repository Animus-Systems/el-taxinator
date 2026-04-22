/**
 * Fastify API server entrypoint.
 *
 * Boots embedded Postgres, ensures schema, mounts the existing tRPC router,
 * and listens on port 7331. Designed to run alongside (or instead of) the
 * Next.js dev server during the migration period.
 *
 * Run: npx tsx --tsconfig server/tsconfig.json server/index.ts
 */

import Fastify from "fastify"
import cors from "@fastify/cors"
import fastifyStatic from "@fastify/static"
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify"
import fs from "fs"
import path from "path"

import {
  getEntities,
  getActiveEntityIdFromFile,
  getPoolForEntity,
} from "@/lib/entities"
import { startCluster } from "@/lib/embedded-pg"
import { ensureSchema } from "@/lib/schema"
import { appRouter } from "@/lib/trpc/router"
import { getOrCreateSelfHostedUser } from "@/models/users"
import type { User } from "@/lib/db-types"
import type { TRPCContext } from "@/lib/trpc/context"
import { importRoutes } from "./routes/import"
import { bundleRoutes } from "./routes/bundle"
import { filesRoutes } from "./routes/files"
import { exportRoutes } from "./routes/export"
import { invoicesRoutes } from "./routes/invoices"
import { quotesRoutes } from "./routes/quotes"
import { purchasesRoutes } from "./routes/purchases"
import { receiptsRoutes } from "./routes/receipts"
import { personalRoutes } from "./routes/personal"
import { contactsRoutes } from "./routes/contacts"
import { backupRoutes } from "./routes/backups"
import { registerFastifyTrpcRoutes } from "./trpc-fastify"

// ---------------------------------------------------------------------------
// State — resolved during boot, used by context factory
// ---------------------------------------------------------------------------

/** The active entity ID, resolved from disk at startup. */
let activeEntityId: string

/** Cached self-hosted user, refreshed on boot. */
let cachedUser: User | null = null
let cachedUserEntityId: string | null = null

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function bootDatabase(): Promise<void> {
  const entities = getEntities()

  if (entities.length === 0) {
    console.log("[server] No entities configured — skipping cluster startup")
    return
  }

  activeEntityId = getActiveEntityIdFromFile()
  const entity = entities.find((e) => e.id === activeEntityId) ?? entities[0]
  if (!entity) {
    console.log("[server] No entity available — skipping cluster startup")
    return
  }
  activeEntityId = entity.id

  if (entity.db) {
    console.log(
      `[server] Entity "${entity.id}" uses external DB — skipping cluster startup`,
    )
  } else {
    await startCluster(entity.id, entity.dataDir)
  }

  // Run pending schema migrations on startup
  const pool = await getPoolForEntity(entity.id)
  const result = await ensureSchema(pool)
  if (result.status === "fresh") {
    console.log("[server] Applied fresh schema")
  } else if (result.status === "migrated") {
    console.log(
      `[server] Schema migrated: v${result.fromVersion} -> v${result.toVersion}`,
    )
  } else {
    console.log("[server] Schema up to date")
  }
}

async function resolveSelfHostedUser(): Promise<User | null> {
  const entities = getEntities()
  if (entities.length === 0) {
    cachedUser = null
    cachedUserEntityId = null
    return null
  }

  const nextEntityId = getActiveEntityIdFromFile()
  activeEntityId = nextEntityId

  if (cachedUser && cachedUserEntityId === nextEntityId) {
    return cachedUser
  }

  const user = await getOrCreateSelfHostedUser()
  cachedUser = user
  cachedUserEntityId = nextEntityId
  return user
}

// ---------------------------------------------------------------------------
// tRPC context factory for Fastify
// ---------------------------------------------------------------------------

/**
 * Creates the tRPC context for each Fastify request.
 *
 * In self-hosted mode there is exactly one user (taxhacker@localhost).
 * We cache the user at startup and return it for every request so
 * authedProcedure always has a valid user object.
 *
 * NOTE: This replaces lib/trpc/context.ts's createTRPCContext which relies
 * on Next.js cookies() from next/headers.
 */
async function createFastifyContext(
  _opts: CreateFastifyContextOptions,
): Promise<TRPCContext> {
  try {
    const user = await resolveSelfHostedUser()
    return { user }
  } catch (error) {
    console.error("[server] Failed to resolve self-hosted user:", error)
    return { user: null }
  }
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env["PORT"] ?? "7331", 10)
const DIST_DIR = path.join(process.cwd(), "dist")
const INDEX_FILE = path.join(DIST_DIR, "index.html")

async function main() {
  // 1. Boot embedded Postgres + ensure schema
  console.log("[server] Booting database...")
  await bootDatabase()

  // 2. Ensure the self-hosted user exists (direct pool query, no cookies)
  cachedUser = await resolveSelfHostedUser()
  if (cachedUser) {
    console.log("[server] Self-hosted user ready")
  }

  // 3. Create Fastify instance
  const app = Fastify({
    logger: { level: "info" },
  })

  // 4. Register CORS (allow Vite dev server + local origins)
  await app.register(cors, {
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:7331",
      "http://127.0.0.1:5173",
      "http://127.0.0.1:5174",
      "http://127.0.0.1:7331",
    ],
    credentials: true,
  })

  const hasClientBuild = fs.existsSync(INDEX_FILE)
  if (hasClientBuild) {
    await app.register(fastifyStatic, {
      root: DIST_DIR,
      prefix: "/",
    })
  } else {
    console.log("[server] No client build found under dist/ - API-only mode")
  }

  // 5. Mount tRPC. Use a wildcard route so comma-joined batch URLs from
  // httpBatchLink resolve correctly under Fastify.
  await registerFastifyTrpcRoutes(app, {
    prefix: "/api/trpc",
    router: appRouter,
    createContext: createFastifyContext,
  })

  // 6. Mount bundle routes first so multipart gets a large enough file limit
  // for portable backup restores before the smaller import/file routes attach.
  await app.register(bundleRoutes)

  // 7. Mount import routes (file upload + AI import pipeline)
  await app.register(importRoutes)
  await app.register(filesRoutes)
  await app.register(exportRoutes)
  await app.register(invoicesRoutes)
  await app.register(quotesRoutes)
  await app.register(purchasesRoutes)
  await app.register(receiptsRoutes)
  await app.register(personalRoutes)
  await app.register(contactsRoutes)
  await app.register(backupRoutes)

  // 8. Health check endpoint
  app.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() }
  })

  if (hasClientBuild) {
    app.setNotFoundHandler((request, reply) => {
      const acceptsHtml = request.headers.accept?.includes("text/html") ?? false
      const isApiRoute = request.url.startsWith("/api/")
      const isHealthRoute = request.url === "/health"

      if (request.method === "GET" && acceptsHtml && !isApiRoute && !isHealthRoute) {
        return reply.type("text/html").send(fs.createReadStream(INDEX_FILE))
      }

      return reply.code(404).send({
        message: `Route ${request.method}:${request.url} not found`,
        error: "Not Found",
        statusCode: 404,
      })
    })
  }

  // 9. Listen
  await app.listen({ port: PORT, host: "0.0.0.0" })
  console.log(`[server] Listening on http://localhost:${PORT}`)
  console.log(`[server] tRPC endpoint: http://localhost:${PORT}/api/trpc`)
  console.log(`[server] Health check:  http://localhost:${PORT}/health`)
}

main().catch((err) => {
  console.error("[server] Fatal error during startup:", err)
  process.exit(1)
})
