"use server"

import path from "path"
import {
  getEntities,
  getEntityById,
  addEntity,
  updateEntity,
  removeEntity,
  testDatabaseConnection,
  closePoolForEntity,
  setActiveEntity,
  getActiveEntityIdFromFile,
  resolveEntityDir,
  clearActiveEntityFile,
  ENTITY_COOKIE,
  type Entity,
  type EntityType,
} from "@/lib/entities"
import { cookies } from "next/headers"

export async function switchEntityAction(entityId: string) {
  const entities = getEntities()
  if (!entities.some((e) => e.id === entityId)) {
    return { success: false, error: "Entity not found" }
  }

  await setActiveEntity(entityId)
  return { success: true }
}

/**
 * Create a new entity backed by its own embedded Postgres cluster.
 * This is the default path for self-hosted users — no external DB needed.
 */
export async function createLocalEntityAction(data: {
  name: string
  type: EntityType
  dataDir?: string
}) {
  const { codeFromName, folderNameFromName } = await import("@/lib/utils")
  const id = codeFromName(data.name)
  if (!id) return { success: false, error: "Invalid entity name" }

  if (getEntities().some((e) => e.id === id)) {
    return { success: false, error: "An entity with this name already exists" }
  }

  try {
    // Resolve data directory: when the user picks a custom folder, treat it
    // as the parent and create a short company-named subfolder inside it.
    const customParentDir = data.dataDir ? path.resolve(data.dataDir) : undefined
    const folderName = folderNameFromName(data.name) || id
    const customDir = customParentDir ? path.join(customParentDir, folderName) : undefined
    const { initNewCluster, getEntityDataDir } = await import("@/lib/embedded-pg")
    const entityDir = customDir ?? getEntityDataDir(id)

    await initNewCluster(id, customDir)

    const fs = await import("fs")
    fs.mkdirSync(path.join(entityDir, "uploads"), { recursive: true })

    addEntity({ id, name: data.name, type: data.type, dataDir: customDir })

    const { connectAction } = await import("@/actions/auth")
    const result = await connectAction(id)
    if (!result.success) {
      return result
    }

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
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to update entity" }
  }
}

/**
 * Unregister an entity from entities.json without deleting its data.
 * The data folder remains on disk and can be re-adopted later.
 */
export async function disconnectEntityAction(id: string) {
  const entity = getEntityById(id)
  if (!entity) {
    return { success: false, error: "Entity not found" }
  }

  try {
    const cookieStore = await cookies()
    const currentCookieEntityId = cookieStore.get(ENTITY_COOKIE)?.value
    const persistedActiveEntityId = getActiveEntityIdFromFile()
    const { getRunningClusterEntityId, stopCluster } = await import("@/lib/embedded-pg")
    const runningClusterEntityId = getRunningClusterEntityId()

    await closePoolForEntity(id)

    if (runningClusterEntityId === id) {
      await stopCluster()
    }

    removeEntity(id)

    if (currentCookieEntityId === id) {
      cookieStore.delete(ENTITY_COOKIE)
    }

    if (persistedActiveEntityId === id || runningClusterEntityId === id) {
      clearActiveEntityFile()
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to disconnect entity" }
  }
}

export async function removeEntityAction(id: string) {
  const entity = getEntityById(id)
  if (!entity) {
    return { success: false, error: "Entity not found" }
  }

  try {
    const entityDir = !entity.db ? resolveEntityDir(id) : null

    const cookieStore = await cookies()
    const currentCookieEntityId = cookieStore.get(ENTITY_COOKIE)?.value
    const persistedActiveEntityId = getActiveEntityIdFromFile()
    const { getRunningClusterEntityId, stopCluster } = await import("@/lib/embedded-pg")
    const runningClusterEntityId = getRunningClusterEntityId()

    await closePoolForEntity(id)

    if (runningClusterEntityId === id) {
      await stopCluster()
    }

    removeEntity(id)

    if (currentCookieEntityId === id) {
      cookieStore.delete(ENTITY_COOKIE)
    }

    if (persistedActiveEntityId === id || runningClusterEntityId === id) {
      clearActiveEntityFile()
    }

    if (entityDir) {
      const fs = await import("fs")
      fs.rmSync(entityDir, { recursive: true, force: true })
    }

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
  const pathMod = await import("path")
  const os = await import("os")

  const resolved = dirPath ? pathMod.resolve(dirPath) : os.homedir()

  try {
    const entries = fs.readdirSync(resolved, { withFileTypes: true })
    const dirs = entries
      .filter(e => e.isDirectory() && !e.name.startsWith("."))
      .map(e => e.name)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))

    const parent = pathMod.dirname(resolved)

    // Detect cloud storage shortcuts (macOS CloudStorage, /Volumes, Linux mounts)
    const shortcuts: { name: string; path: string }[] = []
    const cloudStorage = pathMod.join(os.homedir(), "Library", "CloudStorage")
    if (fs.existsSync(cloudStorage)) {
      try {
        for (const entry of fs.readdirSync(cloudStorage, { withFileTypes: true })) {
          if (entry.isDirectory() || entry.isSymbolicLink()) {
            shortcuts.push({ name: entry.name.replace(/^GoogleDrive-/, "Google Drive — "), path: pathMod.join(cloudStorage, entry.name) })
          }
        }
      } catch {}
    }
    // External volumes (macOS)
    if (fs.existsSync("/Volumes")) {
      try {
        for (const entry of fs.readdirSync("/Volumes", { withFileTypes: true })) {
          if ((entry.isDirectory() || entry.isSymbolicLink()) && entry.name !== "Macintosh HD") {
            shortcuts.push({ name: entry.name, path: pathMod.join("/Volumes", entry.name) })
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
    return { current: resolved, parent: pathMod.dirname(resolved), directories: [], shortcuts: [] }
  }
}

export async function createDirectoryAction(dirPath: string) {
  const fs = await import("fs")
  const pathMod = await import("path")

  const resolved = pathMod.resolve(dirPath)
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
