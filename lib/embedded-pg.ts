import EmbeddedPostgres from "embedded-postgres"
import pg from "pg"
import fs from "fs"
import net from "net"
import path from "path"
import { randomUUID } from "crypto"

// ---------------------------------------------------------------------------
// Embedded PostgreSQL — single in-process cluster, one database per entity
// ---------------------------------------------------------------------------
//
// On boot we spawn a real PostgreSQL 17 binary (bundled via the
// `embedded-postgres` npm package) and use it as the canonical DB for the
// app. Each Taxinator entity gets its own database inside this cluster.
//
// Data lives under TAXINATOR_DATA_DIR (or ./data by default) so the user can
// move / back up / restore the entire app state by copying one folder.

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
const RUNTIME_FILE = "runtime.json"

function getDataRoot(): string {
  return path.resolve(process.env.TAXINATOR_DATA_DIR ?? path.join(process.cwd(), "data"))
}

function getPgDataDir(): string {
  return path.join(getDataRoot(), "pgdata")
}

function getRuntimeFilePath(): string {
  return path.join(getDataRoot(), RUNTIME_FILE)
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

function loadRuntimeConfig(): RuntimeConfig | null {
  const filePath = getRuntimeFilePath()
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

function saveRuntimeConfig(config: RuntimeConfig): void {
  const filePath = getRuntimeFilePath()
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
  ensuredDatabases: Set<string>
}

const globalForCluster = globalThis as unknown as {
  __taxinatorEmbeddedCluster: ClusterState | undefined
  __taxinatorEmbeddedClusterStarting: Promise<ClusterState> | undefined
}

export async function startCluster(): Promise<ClusterInfo> {
  if (globalForCluster.__taxinatorEmbeddedCluster) {
    return globalForCluster.__taxinatorEmbeddedCluster.info
  }
  if (globalForCluster.__taxinatorEmbeddedClusterStarting) {
    const state = await globalForCluster.__taxinatorEmbeddedClusterStarting
    return state.info
  }

  globalForCluster.__taxinatorEmbeddedClusterStarting = (async () => {
    const dataDir = getPgDataDir()
    const initialised = isAlreadyInitialised(dataDir)

    // Reuse port + password from runtime.json when possible. Generate fresh
    // ones for first-run, OR if the saved port is now occupied (e.g. another
    // process grabbed it during a system reboot).
    const existing = loadRuntimeConfig()
    let port: number
    let password: string

    if (existing && !(await isPortInUse(existing.port))) {
      port = existing.port
      password = existing.password
    } else {
      port = await pickFreePort()
      password = existing?.password ?? randomUUID().replace(/-/g, "")
      saveRuntimeConfig({ port, password })
    }

    const instance = new EmbeddedPostgres({
      databaseDir: dataDir,
      user: SUPERUSER,
      password,
      port,
      persistent: true,
    })

    if (!initialised) {
      console.log(`[embedded-pg] Initialising new cluster at ${dataDir}`)
      await instance.initialise()
    }

    console.log(`[embedded-pg] Starting cluster on 127.0.0.1:${port}`)
    await instance.start()

    const info: ClusterInfo = {
      host: "127.0.0.1",
      port,
      user: SUPERUSER,
      password,
      dataDir,
    }

    // Make the cluster URL discoverable to legacy code that reads
    // `process.env.DATABASE_URL` (e.g. the CI guard in models/users.ts).
    if (!process.env.DATABASE_URL) {
      process.env.DATABASE_URL = buildConnectionString(info, SUPERUSER)
    }

    const state: ClusterState = {
      pg: instance,
      info,
      ensuredDatabases: new Set(),
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

/**
 * Build a Postgres connection string for a database in the embedded cluster.
 * The database name defaults to the superuser's default DB ("taxinator"); pass
 * an entity ID to target a per-entity database.
 */
export function buildConnectionString(info: ClusterInfo, dbName: string): string {
  const encodedPassword = encodeURIComponent(info.password)
  return `postgresql://${info.user}:${encodedPassword}@${info.host}:${info.port}/${encodeURIComponent(dbName)}`
}

/**
 * Get the connection string for an entity's database in the embedded cluster.
 * Throws if the cluster has not been started yet.
 */
export function getEmbeddedConnectionString(dbName: string): string {
  const info = getClusterInfo()
  if (!info) {
    throw new Error("Embedded Postgres cluster has not been started")
  }
  return buildConnectionString(info, dbName)
}

/**
 * Ensure a database exists in the embedded cluster. Idempotent: safe to call
 * on every connection. Caches the result so we don't hit the system catalog
 * on every request.
 */
export async function ensureDatabase(dbName: string): Promise<void> {
  const state = globalForCluster.__taxinatorEmbeddedCluster
  if (!state) {
    throw new Error("Embedded Postgres cluster has not been started")
  }
  if (state.ensuredDatabases.has(dbName)) return

  // Connect to the default 'postgres' admin database to run CREATE DATABASE.
  // We can't use a transaction here — Postgres rejects CREATE DATABASE inside
  // a transaction block — so each query goes on its own client.
  const adminUrl = buildConnectionString(state.info, "postgres")
  const client = new pg.Client({ connectionString: adminUrl })
  await client.connect()
  try {
    const result = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [dbName],
    )
    if (result.rowCount === 0) {
      // pg_format_identifier would be ideal but isn't available client-side;
      // we manually quote the identifier and reject anything containing a
      // double-quote (defence in depth — entity IDs are already slugified).
      if (dbName.includes('"') || dbName.includes("\0")) {
        throw new Error(`Invalid database name: ${dbName}`)
      }
      await client.query(`CREATE DATABASE "${dbName}"`)
      console.log(`[embedded-pg] Created database "${dbName}"`)
    }
    state.ensuredDatabases.add(dbName)
  } finally {
    await client.end()
  }
}

/**
 * Stop the embedded cluster gracefully. Safe to call when no cluster is
 * running. Does not delete data (we always run with persistent: true).
 */
export async function stopCluster(): Promise<void> {
  const state = globalForCluster.__taxinatorEmbeddedCluster
  if (!state) return
  console.log(`[embedded-pg] Stopping cluster on 127.0.0.1:${state.info.port}`)
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
