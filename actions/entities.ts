"use server"

import {
  getEntities,
  getEntityById,
  addEntity,
  updateEntity,
  removeEntity,
  testDatabaseConnection,
  closePoolForEntity,
  setActiveEntity,
  ENTITY_COOKIE,
  type Entity,
  type EntityType,
} from "@/lib/entities"
import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"

export async function switchEntityAction(entityId: string) {
  const entities = getEntities()
  if (!entities.some((e) => e.id === entityId)) {
    return { success: false, error: "Entity not found" }
  }

  await setActiveEntity(entityId)
  revalidatePath("/", "layout")
  return { success: true }
}

/**
 * Create a new entity backed by the embedded Postgres cluster.
 * This is the default path for self-hosted users — no external DB needed.
 */
export async function createLocalEntityAction(data: {
  name: string
  type: EntityType
  dataDir?: string
}) {
  const { codeFromName } = await import("@/lib/utils")
  const id = codeFromName(data.name)
  if (!id) return { success: false, error: "Invalid entity name" }

  if (getEntities().some((e) => e.id === id)) {
    return { success: false, error: `An entity with this name already exists` }
  }

  try {
    addEntity({ id, name: data.name, type: data.type, dataDir: data.dataDir })
    revalidatePath("/", "layout")
    return { success: true, entityId: id }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to create entity" }
  }
}

/**
 * Add an entity that points at an external Postgres URL. Advanced/dev only —
 * the standard self-hosted flow uses createLocalEntityAction.
 */
export async function addExternalEntityAction(data: {
  name: string
  type: EntityType
  db: string
}) {
  const { codeFromName } = await import("@/lib/utils")
  const id = codeFromName(data.name)
  if (!id) return { success: false, error: "Invalid entity name" }
  if (!data.db) return { success: false, error: "Database connection string is required" }

  const test = await testDatabaseConnection(data.db)
  if (!test.ok) {
    return { success: false, error: `Cannot connect to database: ${test.error}` }
  }

  try {
    addEntity({ id, name: data.name, type: data.type, db: data.db })
    revalidatePath("/", "layout")
    return { success: true, entityId: id }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to add entity" }
  }
}

export async function updateEntityAction(id: string, data: Partial<Omit<Entity, "id">>) {
  if (data.db) {
    const test = await testDatabaseConnection(data.db)
    if (!test.ok) {
      return { success: false, error: `Cannot connect to database: ${test.error}` }
    }
    // Close old pool so it reconnects with new credentials
    await closePoolForEntity(id)
  }

  try {
    updateEntity(id, data)
    revalidatePath("/", "layout")
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to update entity" }
  }
}

export async function removeEntityAction(id: string, deleteData: boolean = false) {
  const entity = getEntityById(id)
  if (!entity) {
    return { success: false, error: "Entity not found" }
  }

  try {
    await closePoolForEntity(id)

    // Optionally delete the entity's data directory (uploads + anything else
    // stored under dataDir). The shared embedded cluster's per-entity database
    // is left behind — `DROP DATABASE` would require switching to a different
    // admin connection and is not worth the complexity for this code path.
    if (deleteData && entity.dataDir) {
      const fs = await import("fs")
      try {
        fs.rmSync(entity.dataDir, { recursive: true, force: true })
      } catch {}
    }

    removeEntity(id)

    // If we removed the active entity, switch to the first remaining one
    const cookieStore = await cookies()
    const current = cookieStore.get(ENTITY_COOKIE)?.value
    if (current === id) {
      const remaining = getEntities()
      if (remaining.length > 0) {
        await setActiveEntity(remaining[0].id)
      } else {
        cookieStore.delete(ENTITY_COOKIE)
      }
    }

    revalidatePath("/", "layout")
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to remove entity" }
  }
}

export async function testConnectionAction(connectionString: string) {
  return testDatabaseConnection(connectionString)
}

export async function listDirectoriesAction(dirPath?: string) {
  const fs = await import("fs")
  const path = await import("path")
  const os = await import("os")

  const resolved = dirPath ? path.resolve(dirPath) : os.homedir()

  try {
    const entries = fs.readdirSync(resolved, { withFileTypes: true })
    const dirs = entries
      .filter(e => e.isDirectory() && !e.name.startsWith("."))
      .map(e => e.name)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))

    const parent = path.dirname(resolved)

    // Detect cloud storage shortcuts (macOS CloudStorage, /Volumes, Linux mounts)
    const shortcuts: { name: string; path: string }[] = []
    const cloudStorage = path.join(os.homedir(), "Library", "CloudStorage")
    if (fs.existsSync(cloudStorage)) {
      try {
        for (const entry of fs.readdirSync(cloudStorage, { withFileTypes: true })) {
          if (entry.isDirectory() || entry.isSymbolicLink()) {
            shortcuts.push({ name: entry.name.replace(/^GoogleDrive-/, "Google Drive — "), path: path.join(cloudStorage, entry.name) })
          }
        }
      } catch {}
    }
    // External volumes (macOS)
    if (fs.existsSync("/Volumes")) {
      try {
        for (const entry of fs.readdirSync("/Volumes", { withFileTypes: true })) {
          if ((entry.isDirectory() || entry.isSymbolicLink()) && entry.name !== "Macintosh HD") {
            shortcuts.push({ name: entry.name, path: path.join("/Volumes", entry.name) })
          }
        }
      } catch {}
    }

    return {
      current: resolved,
      parent: parent !== resolved ? parent : null,
      directories: dirs,
      shortcuts,
    }
  } catch {
    return { current: resolved, parent: path.dirname(resolved), directories: [], shortcuts: [] }
  }
}

export async function createDirectoryAction(dirPath: string) {
  const fs = await import("fs")
  const path = await import("path")

  const resolved = path.resolve(dirPath)
  try {
    fs.mkdirSync(resolved, { recursive: true })
    return { success: true, path: resolved }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to create folder" }
  }
}

export async function getEntitiesAction() {
  return getEntities()
}
