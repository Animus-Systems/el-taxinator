import EmbeddedPostgres from "embedded-postgres"
import pg from "pg"
import fs from "fs"
import net from "net"
import path from "path"
import { randomUUID } from "crypto"

// ---------------------------------------------------------------------------
// Embedded PostgreSQL — per-entity in-process clusters
// ---------------------------------------------------------------------------
//
// Each Taxinator entity gets its own Postgres cluster under
// `<dataRoot>/<entityId>/pgdata/` with a fixed database name ("taxinator").
//
// Data lives under TAXINATOR_DATA_DIR (or ./data by default, overridable via
// taxinator.config.json) so the user can move / back up / restore the entire
// app state by copying one folder.

export type ClusterInfo = {
  host: string
  port: number
  user: string
  password: string
  dataDir: string
}

type RuntimeConfig = {
  port: number
  password: string
}

const SUPERUSER = "taxinator"
const DB_NAME = "taxinator"
const RUNTIME_FILE = "runtime.json"
const CONFIG_FILE = "taxinator.config.json"

// ---------------------------------------------------------------------------
// App-level config (taxinator.config.json at project root)
// ---------------------------------------------------------------------------

type AppConfig = {
  dataDir?: string
}

function loadAppConfig(): AppConfig {
  const filePath = path.join(process.cwd(), CONFIG_FILE)
  try {
    if (!fs.existsSync(filePath)) return {}
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as AppConfig
  } catch {
    return {}
  }
}

export function saveAppConfig(config: AppConfig): void {
  const filePath = path.join(process.cwd(), CONFIG_FILE)
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), "utf-8")
}

// ---------------------------------------------------------------------------
// Path helpers — all scoped by entityId
// ---------------------------------------------------------------------------

export function getDataRoot(): string {
  const fromConfig = loadAppConfig().dataDir
  const resolved = fromConfig ?? process.env.TAXINATOR_DATA_DIR ?? path.join(process.cwd(), "data")
  return path.resolve(resolved)
}

export function getEntityDataDir(entityId: string): string {
  return path.join(getDataRoot(), entityId)
}

function getPgDataDir(entityId: string): string {
  return path.join(getEntityDataDir(entityId), "pgdata")
}

function getRuntimeFilePath(entityId: string): string {
  return path.join(getEntityDataDir(entityId), RUNTIME_FILE)
}

/**
 * Detect whether a Postgres data directory has already been initialised.
 * `initdb` always creates a `PG_VERSION` file inside the data dir.
 */
function isAlreadyInitialised(dir: string): boolean {
  return fs.existsSync(path.join(dir, "PG_VERSION"))
}

/**
 * Ask the OS for a free TCP port on 127.0.0.1 by binding to port 0 and
 * reading back the assigned port. There's a tiny race window between
 * releasing the socket and Postgres binding to it, but it's been reliable
 * enough in practice for tools like `embedded-postgres`, `vitest`, etc.
 */
async function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (address && typeof address === "object") {
        const { port } = address
        server.close(() => resolve(port))
      } else {
        server.close()
        reject(new Error("Failed to allocate port"))
      }
    })
  })
}

function loadRuntimeConfigFromPath(filePath: string): RuntimeConfig | null {
  if (!fs.existsSync(filePath)) return null
  try {
    const raw = fs.readFileSync(filePath, "utf-8")
    const parsed = JSON.parse(raw) as RuntimeConfig
    if (!parsed.port || !parsed.password) return null
    return parsed
  } catch {
    return null
  }
}

function saveRuntimeConfigToPath(filePath: string, config: RuntimeConfig): void {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), "utf-8")
}

async function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net.createServer()
    tester.once("error", () => resolve(true))
    tester.once("listening", () => {
      tester.close(() => resolve(false))
    })
    tester.listen(port, "127.0.0.1")
  })
}

// ---------------------------------------------------------------------------
// Cluster lifecycle — cached on globalThis to survive Next.js HMR
// ---------------------------------------------------------------------------

type ClusterState = {
  pg: EmbeddedPostgres
  info: ClusterInfo
  entityId: string
}

const globalForCluster = globalThis as unknown as {
  __taxinatorEmbeddedCluster: ClusterState | undefined
  __taxinatorEmbeddedClusterStarting: Promise<ClusterState> | undefined
}

export async function startCluster(entityId: string, entityDataDir?: string): Promise<ClusterInfo> {
  // If a cluster is already running for the SAME entity, return it.
  if (globalForCluster.__taxinatorEmbeddedCluster) {
    if (globalForCluster.__taxinatorEmbeddedCluster.entityId === entityId) {
      return globalForCluster.__taxinatorEmbeddedCluster.info
    }
    // Different entity — stop the current cluster first.
    console.log(
      `[embedded-pg] Switching from entity "${globalForCluster.__taxinatorEmbeddedCluster.entityId}" to "${entityId}"`,
    )
    await stopCluster()
  }

  if (globalForCluster.__taxinatorEmbeddedClusterStarting) {
    const state = await globalForCluster.__taxinatorEmbeddedClusterStarting
    if (state.entityId === entityId) {
      return state.info
    }
    // Started for a different entity — stop it and proceed.
    await stopCluster()
  }

  globalForCluster.__taxinatorEmbeddedClusterStarting = (async () => {
    const baseDir = entityDataDir ?? getEntityDataDir(entityId)
    const dataDir = path.join(baseDir, "pgdata")
    const runtimeFile = path.join(baseDir, RUNTIME_FILE)
    const initialised = isAlreadyInitialised(dataDir)

    // Reuse port + password from runtime.json when possible. Generate fresh
    // ones for first-run, OR if the saved port is now occupied (e.g. another
    // process grabbed it during a system reboot).
    const existing = loadRuntimeConfigFromPath(runtimeFile)
    let port: number
    let password: string

    if (existing && !(await isPortInUse(existing.port))) {
      port = existing.port
      password = existing.password
    } else {
      port = await pickFreePort()
      password = existing?.password ?? randomUUID().replace(/-/g, "")
      saveRuntimeConfigToPath(runtimeFile, { port, password })
    }

    const instance = new EmbeddedPostgres({
      databaseDir: dataDir,
      user: SUPERUSER,
      password,
      port,
      persistent: true,
    })

    if (!initialised) {
      console.log(`[embedded-pg] Initialising new cluster for "${entityId}" at ${dataDir}`)
      await instance.initialise()
    }

    console.log(`[embedded-pg] Starting cluster for "${entityId}" on 127.0.0.1:${port}`)
    await instance.start()

    // Ensure the application database exists (initdb only creates "postgres")
    const adminInfo: ClusterInfo = { host: "127.0.0.1", port, user: SUPERUSER, password, dataDir }
    const adminUrl = buildConnectionString(adminInfo, "postgres")
    const client = new pg.Client({ connectionString: adminUrl })
    await client.connect()
    try {
      const result = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [DB_NAME])
      if (result.rowCount === 0) {
        await client.query(`CREATE DATABASE "${DB_NAME}"`)
        console.log(`[embedded-pg] Created database "${DB_NAME}"`)
      }
    } finally {
      await client.end()
    }

    const info: ClusterInfo = {
      host: "127.0.0.1",
      port,
      user: SUPERUSER,
      password,
      dataDir,
    }

    // Make the cluster URL discoverable to legacy code that reads
    // `process.env.DATABASE_URL` (e.g. the CI guard in models/users.ts).
    process.env.DATABASE_URL = buildConnectionString(info, DB_NAME)

    const state: ClusterState = {
      pg: instance,
      info,
      entityId,
    }

    registerShutdownHooks(state)

    globalForCluster.__taxinatorEmbeddedCluster = state
    return state
  })().finally(() => {
    globalForCluster.__taxinatorEmbeddedClusterStarting = undefined
  })

  const state = await globalForCluster.__taxinatorEmbeddedClusterStarting
  return state.info
}

export function getClusterInfo(): ClusterInfo | null {
  return globalForCluster.__taxinatorEmbeddedCluster?.info ?? null
}

export function getRunningClusterEntityId(): string | null {
  return globalForCluster.__taxinatorEmbeddedCluster?.entityId ?? null
}

/**
 * Build a Postgres connection string for a database in the embedded cluster.
 */
export function buildConnectionString(info: ClusterInfo, dbName: string): string {
  const encodedPassword = encodeURIComponent(info.password)
  return `postgresql://${info.user}:${encodedPassword}@${info.host}:${info.port}/${encodeURIComponent(dbName)}`
}

/**
 * Get the connection string for the fixed "taxinator" database in the
 * embedded cluster. Throws if the cluster has not been started yet.
 */
export function getEmbeddedConnectionString(): string {
  const info = getClusterInfo()
  if (!info) {
    throw new Error("Embedded Postgres cluster has not been started")
  }
  return buildConnectionString(info, DB_NAME)
}

/**
 * Initialise a new Postgres cluster for an entity without starting it.
 * Idempotent — if the cluster directory already exists this is a no-op.
 * After calling this the cluster can be started later with `startCluster`.
 */
export async function initNewCluster(entityId: string, entityDataDir?: string): Promise<void> {
  const baseDir = entityDataDir ?? getEntityDataDir(entityId)
  const dataDir = path.join(baseDir, "pgdata")
  const runtimeFile = path.join(baseDir, RUNTIME_FILE)

  if (isAlreadyInitialised(dataDir)) {
    console.log(`[embedded-pg] Cluster for "${entityId}" already initialised`)
    return
  }
  const port = await pickFreePort()
  const password = randomUUID().replace(/-/g, "")
  const instance = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: SUPERUSER,
    password,
    port,
    persistent: true,
  })
  console.log(`[embedded-pg] Initialising new cluster for "${entityId}" at ${dataDir}`)
  await instance.initialise()
  saveRuntimeConfigToPath(runtimeFile, { port, password })
  console.log(`[embedded-pg] Cluster for "${entityId}" initialised (not started)`)
}

/**
 * Stop the embedded cluster gracefully. Safe to call when no cluster is
 * running. Does not delete data (we always run with persistent: true).
 */
export async function stopCluster(): Promise<void> {
  const state = globalForCluster.__taxinatorEmbeddedCluster
  if (!state) return
  console.log(`[embedded-pg] Stopping cluster for "${state.entityId}" on 127.0.0.1:${state.info.port}`)
  try {
    await state.pg.stop()
  } catch (err) {
    console.error("[embedded-pg] Error stopping cluster:", err)
  } finally {
    globalForCluster.__taxinatorEmbeddedCluster = undefined
  }
}

let shutdownHooksRegistered = false

function registerShutdownHooks(_state: ClusterState): void {
  if (shutdownHooksRegistered) return
  shutdownHooksRegistered = true

  const shutdown = async (signal: string) => {
    console.log(`[embedded-pg] Received ${signal}, shutting down`)
    await stopCluster()
    process.exit(0)
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"))
  process.on("SIGINT", () => void shutdown("SIGINT"))
  process.on("beforeExit", () => void stopCluster())
}
