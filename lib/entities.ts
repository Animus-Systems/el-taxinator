import pg, { type Pool } from "pg"
import fs from "fs"
import path from "path"
import {
  startCluster,
  getClusterInfo,
  getRunningClusterEntityId,
  getEmbeddedConnectionString,
  getDataRoot,
  getEntityDataDir,
} from "./embedded-pg"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EntityType = "autonomo" | "sl"

export type Entity = {
  id: string
  name: string
  type: EntityType
  /**
   * Postgres connection string. Optional: when omitted, the entity uses its
   * own cluster under data/<id>/. Set this only when pointing at an external
   * Postgres for advanced/dev scenarios.
   */
  db?: string
  /**
   * Custom data directory for this entity. When set, pgdata/, uploads/, and
   * runtime.json live here instead of under the global data root.
   * If omitted, defaults to `<dataRoot>/<entityId>/`.
   */
  dataDir?: string
}

// ---------------------------------------------------------------------------
// Configuration — file-based with env var fallback
// ---------------------------------------------------------------------------

export const ENTITY_COOKIE = "TAXINATOR_ENTITY"

function getEntitiesFilePath(): string {
  return process.env.ENTITIES_FILE ?? path.join(process.cwd(), "data", "entities.json")
}

function loadEntitiesFromFile(): Entity[] | null {
  const filePath = getEntitiesFilePath()
  try {
    if (!fs.existsSync(filePath)) return null
    const raw = fs.readFileSync(filePath, "utf-8")
    const parsed = JSON.parse(raw) as Entity[]
    if (!Array.isArray(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

function loadEntitiesFromEnv(): Entity[] | null {
  const raw = process.env.ENTITIES
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Entity[]
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    return parsed
  } catch {
    return null
  }
}

function loadEntitiesFromDatabaseUrl(): Entity[] {
  const db = process.env.DATABASE_URL
  if (!db) return []
  return [{ id: "default", name: "Default", type: "autonomo", db }]
}

let _entities: Entity[] | null = null

export function getEntities(): Entity[] {
  if (!_entities) {
    _entities = loadEntitiesFromFile() ?? loadEntitiesFromEnv() ?? loadEntitiesFromDatabaseUrl()
  }
  return _entities
}

/** Force reload entities from disk (after adding/removing) */
export function reloadEntities(): void {
  _entities = null
}

export function getEntityById(id: string): Entity | undefined {
  return getEntities().find((e) => e.id === id)
}

/**
 * Resolve the data directory for an entity. Uses entity.dataDir if set,
 * otherwise falls back to the default `<dataRoot>/<entityId>/`.
 */
export function resolveEntityDir(entityId: string): string {
  const entity = getEntityById(entityId)
  if (entity?.dataDir) return path.resolve(entity.dataDir)
  return getEntityDataDir(entityId)
}

export function isMultiEntity(): boolean {
  return getEntities().length > 1
}

export function hasAnyEntities(): boolean {
  return getEntities().length > 0
}

// ---------------------------------------------------------------------------
// Entity CRUD — writes to entities.json
// ---------------------------------------------------------------------------

export function saveEntities(entities: Entity[]): void {
  const filePath = getEntitiesFilePath()
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(filePath, JSON.stringify(entities, null, 2), "utf-8")
  _entities = null // invalidate cache
}

export function addEntity(entity: Entity): void {
  const entities = [...getEntities()]
  if (entities.some((e) => e.id === entity.id)) {
    throw new Error(`Entity with id "${entity.id}" already exists`)
  }
  entities.push(entity)
  saveEntities(entities)
}

export function updateEntity(id: string, updates: Partial<Omit<Entity, "id">>): void {
  const entities = getEntities().map((e) =>
    e.id === id ? { ...e, ...updates } : e,
  )
  saveEntities(entities)
}

export function removeEntity(id: string): void {
  const entities = getEntities().filter((e) => e.id !== id)
  saveEntities(entities)
}

// ---------------------------------------------------------------------------
// Active entity — cookie + file persistence
// ---------------------------------------------------------------------------

const ACTIVE_ENTITY_FILE = "active-entity"

function getActiveEntityFilePath(): string {
  return path.join(getDataRoot(), ACTIVE_ENTITY_FILE)
}

/** Persist active entity ID to a file so instrumentation can read it on restart. */
function saveActiveEntityToFile(entityId: string): void {
  const filePath = getActiveEntityFilePath()
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(filePath, entityId, "utf-8")
}

/** Clear the persisted active entity when no company should stay selected. */
export function clearActiveEntityFile(): void {
  const filePath = getActiveEntityFilePath()
  try {
    fs.rmSync(filePath, { force: true })
  } catch {}
}

/** Read persisted active entity ID from file (for instrumentation — no cookies available). */
export function getActiveEntityIdFromFile(): string {
  const filePath = getActiveEntityFilePath()
  try {
    const id = fs.readFileSync(filePath, "utf-8").trim()
    const entities = getEntities()
    if (entities.some((e) => e.id === id)) return id
  } catch {}
  const entities = getEntities()
  return entities.length > 0 ? entities[0].id : "default"
}

/** Set the active entity and persist to file. */
export async function setActiveEntity(entityId: string): Promise<void> {
  saveActiveEntityToFile(entityId)
}

export async function getActiveEntityId(): Promise<string> {
  const entities = getEntities()
  if (entities.length === 0) return "default"
  if (entities.length === 1) return entities[0].id

  const fromFile = getActiveEntityIdFromFile()
  if (fromFile) {
    const entity = getEntityById(fromFile)
    if (entity) return entity.id
  }
  return entities[0].id
}

export async function getActiveEntity(): Promise<Entity> {
  const id = await getActiveEntityId()
  const entity = getEntityById(id)
  if (entity) return entity

  // Fallback to first entity if the active one was deleted
  const entities = getEntities()
  if (entities.length > 0) return entities[0]

  // No entities configured — return a synthetic default backed by the
  // embedded cluster's "default" database.
  return { id: "default", name: "Default", type: "autonomo" }
}

// ---------------------------------------------------------------------------
// Connection pool manager — one pool per entity, lazily created
// ---------------------------------------------------------------------------

const globalForPools = globalThis as unknown as {
  entityPools: Map<string, Pool> | undefined
}

const poolMap = globalForPools.entityPools ?? new Map<string, Pool>()

if (process.env.NODE_ENV !== "production") {
  globalForPools.entityPools = poolMap
}

/**
 * Resolve the connection string for an entity. If the entity has an explicit
 * `db` field, that wins (lets advanced users point at an external Postgres).
 * Otherwise we fall back to the embedded cluster.
 */
async function resolveConnectionString(entity: Entity): Promise<string> {
  if (entity.db && entity.db.length > 0) {
    return entity.db
  }

  const runningEntityId = getRunningClusterEntityId()
  if (runningEntityId && runningEntityId !== entity.id) {
    await closeAllPools()
  }

  await startCluster(entity.id, entity.dataDir)
  return getEmbeddedConnectionString()
}

export async function getPoolForEntity(entityId: string): Promise<Pool> {
  const entity = getEntityById(entityId)
  if (!entity) throw new Error(`Entity "${entityId}" not found`)

  const existing = poolMap.get(entityId)
  if (existing && entity.db) return existing

  const connectionString = await resolveConnectionString(entity)
  const reusablePool = poolMap.get(entityId)
  if (reusablePool) return reusablePool

  const newPool = new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  })

  poolMap.set(entityId, newPool)
  return newPool
}

/** Close and remove every open pool. Used when switching embedded clusters. */
export async function closeAllPools(): Promise<void> {
  const entries = [...poolMap.entries()]
  await Promise.all(entries.map(async ([entityId, pool]) => {
    await pool.end()
    poolMap.delete(entityId)
  }))
}

/** Close and remove a pool (e.g. when entity is deleted or DB changed) */
export async function closePoolForEntity(entityId: string): Promise<void> {
  const pool = poolMap.get(entityId)
  if (pool) {
    await pool.end()
    poolMap.delete(entityId)
  }
}

/**
 * Close the currently running entity session, if any. This is used when the
 * user disconnects and we are back on the picker page, where no DB access is
 * needed anymore.
 */
export async function shutdownRunningEntitySession(): Promise<void> {
  const { getRunningClusterEntityId, stopCluster } = await import("./embedded-pg")
  const entityId = getRunningClusterEntityId()
  if (!entityId) return

  await closePoolForEntity(entityId)
  await stopCluster()
}

export async function getPool(): Promise<Pool> {
  const entityId = await getActiveEntityId()
  return getPoolForEntity(entityId)
}

/**
 * Test if a database connection string is valid and reachable.
 * Used by the entity creation UI when an advanced user supplies an external URL.
 */
export async function testDatabaseConnection(connectionString: string): Promise<{ ok: boolean; error?: string }> {
  const testPool = new pg.Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 5_000,
  })
  try {
    const client = await testPool.connect()
    await client.query("SELECT 1")
    client.release()
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Connection failed" }
  } finally {
    await testPool.end()
  }
}
