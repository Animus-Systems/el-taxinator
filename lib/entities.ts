import pg from "pg"
import { cookies } from "next/headers"
import fs from "fs"
import path from "path"
import {
  startCluster,
  getClusterInfo,
  ensureDatabase,
  getEmbeddedConnectionString,
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
   * own database inside the embedded cluster (db name = entity id). Set this
   * only when pointing at an external Postgres for advanced/dev scenarios.
   */
  db?: string
  /** Root directory for entity-scoped uploads. Defaults to data/<id>/uploads. */
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
// Active entity (cookie-based)
// ---------------------------------------------------------------------------

/** Set the active entity cookie. */
export async function setActiveEntity(entityId: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(ENTITY_COOKIE, entityId, {
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
    sameSite: "lax",
  })
}

export async function getActiveEntityId(): Promise<string> {
  const entities = getEntities()
  if (entities.length === 0) return "default"
  if (entities.length === 1) return entities[0].id

  const cookieStore = await cookies()
  const stored = cookieStore.get(ENTITY_COOKIE)?.value
  if (stored && entities.some((e) => e.id === stored)) {
    return stored
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
  entityPools: Map<string, pg.Pool> | undefined
}

const poolMap = globalForPools.entityPools ?? new Map<string, pg.Pool>()

if (process.env.NODE_ENV !== "production") {
  globalForPools.entityPools = poolMap
}

/**
 * Resolve the connection string for an entity. If the entity has an explicit
 * `db` field, that wins (lets advanced users point at an external Postgres).
 * Otherwise we fall back to the embedded cluster, creating the per-entity
 * database if it doesn't exist yet.
 */
async function resolveConnectionString(entity: Entity): Promise<string> {
  if (entity.db && entity.db.length > 0) {
    return entity.db
  }

  // Embedded path: ensure the cluster is up and the per-entity database exists
  if (!getClusterInfo()) {
    await startCluster()
  }
  await ensureDatabase(entity.id)
  return getEmbeddedConnectionString(entity.id)
}

export async function getPoolForEntity(entityId: string): Promise<pg.Pool> {
  const existing = poolMap.get(entityId)
  if (existing) return existing

  const entity = getEntityById(entityId)
  if (!entity) throw new Error(`Entity "${entityId}" not found`)

  const connectionString = await resolveConnectionString(entity)

  const newPool = new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  })

  poolMap.set(entityId, newPool)
  return newPool
}

/** Close and remove a pool (e.g. when entity is deleted or DB changed) */
export async function closePoolForEntity(entityId: string): Promise<void> {
  const pool = poolMap.get(entityId)
  if (pool) {
    await pool.end()
    poolMap.delete(entityId)
  }
}

export async function getPool(): Promise<pg.Pool> {
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
