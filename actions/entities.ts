"use server"

import {
  getEntities,
  getEntityById,
  addEntity,
  updateEntity,
  removeEntity,
  reloadEntities,
  testDatabaseConnection,
  generateDockerComposeSnippet,
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

export async function addEntityAction(data: {
  name: string
  type: EntityType
  db: string
}) {
  const { codeFromName } = await import("@/lib/utils")
  const id = codeFromName(data.name)

  if (!id) return { success: false, error: "Invalid entity name" }
  if (!data.db) return { success: false, error: "Database connection string is required" }

  // Test the connection first
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

    // Stop and remove Docker container if we're deleting data
    if (deleteData && entity.dataDir) {
      const fs = await import("fs")
      const path = await import("path")
      const manifestPath = path.join(entity.dataDir, "taxinator.json")

      if (fs.existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"))
          if (manifest.container) {
            const { execFileSync } = await import("child_process")
            try { execFileSync("docker", ["stop", manifest.container], { timeout: 15_000, stdio: "pipe" }) } catch {}
            try { execFileSync("docker", ["rm", manifest.container], { timeout: 10_000, stdio: "pipe" }) } catch {}
          }
        } catch {}
      }

      // Delete the data directory
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

export async function getDockerComposeSnippetAction(data: { id: string; name: string }) {
  return { snippet: generateDockerComposeSnippet(data) }
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

/**
 * Auto-provision a PostgreSQL database using Docker.
 * Requires the host to have Docker installed and the app to have access to the Docker socket.
 */
export async function autoProvisionDatabaseAction(data: { id: string; name: string; type?: EntityType; dataVolume?: string }) {
  const slug = data.id.replace(/[^a-z0-9-]/g, "")
  const password = crypto.randomUUID().replace(/-/g, "")
  const containerName = `taxinator-db-${slug}`
  const port = 5432 + Math.floor(Math.random() * 1000) + 100

  try {
    const { execFileSync } = await import("child_process")
    const path = await import("path")

    // Check if Docker is available
    try {
      execFileSync("docker", ["info"], { timeout: 5000, stdio: "pipe" })
    } catch {
      return { success: false, error: "Docker is not available. Please install Docker or use a manual database connection." }
    }

    // Check if container already exists
    try {
      const existing = execFileSync("docker", ["ps", "-a", "--filter", `name=${containerName}`, "--format", "{{.Names}}"], {
        timeout: 5000,
        encoding: "utf-8",
      }).trim()
      if (existing) {
        return { success: false, error: `Container "${containerName}" already exists. Remove it first or use a different name.` }
      }
    } catch {}

    // Resolve data root — contains pgdata/ and uploads/
    const dataDir = data.dataVolume
      ? path.resolve(data.dataVolume)
      : path.resolve(process.cwd(), "data", slug)
    const pgDataDir = path.join(dataDir, "pgdata")

    const fs = await import("fs")
    fs.mkdirSync(path.join(dataDir, "uploads"), { recursive: true })

    execFileSync("docker", [
      "run", "-d",
      "--name", containerName,
      "-e", `POSTGRES_USER=taxinator`,
      "-e", `POSTGRES_PASSWORD=${password}`,
      "-e", `POSTGRES_DB=taxinator`,
      "-v", `${pgDataDir}:/var/lib/postgresql/data`,
      "-p", `${port}:5432`,
      "--restart", "unless-stopped",
      "postgres:17-alpine",
    ], { timeout: 30_000, stdio: "pipe" })

    // Wait for PostgreSQL to be ready
    let ready = false
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 1000))
      const test = await testDatabaseConnection(`postgresql://taxinator:${password}@localhost:${port}/taxinator`)
      if (test.ok) {
        ready = true
        break
      }
    }

    if (!ready) {
      return { success: false, error: "Database container started but is not yet accepting connections. Try again in a few seconds." }
    }

    const connectionString = `postgresql://taxinator:${password}@localhost:${port}/taxinator`

    // Write a manifest so this folder can be re-opened later
    fs.writeFileSync(path.join(dataDir, "taxinator.json"), JSON.stringify({
      name: data.name,
      type: data.type || "autonomo",
      container: containerName,
      port,
      dbUser: "taxinator",
      dbPassword: password,
      dbName: "taxinator",
    }, null, 2))

    return { success: true, connectionString, containerName, port, dataDir }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to provision database" }
  }
}

/**
 * Read a taxinator.json manifest from a company data folder.
 * Returns the manifest if found, or null.
 */
export async function readFolderManifestAction(folderPath: string) {
  const fs = await import("fs")
  const path = await import("path")

  const resolved = path.resolve(folderPath)
  const manifestPath = path.join(resolved, "taxinator.json")
  const hasPgData = fs.existsSync(path.join(resolved, "pgdata"))
  const hasUploads = fs.existsSync(path.join(resolved, "uploads"))

  if (!fs.existsSync(manifestPath)) {
    if (hasPgData) {
      // Folder has pgdata but no manifest — it's a data folder without metadata
      return { found: false, hasData: true, path: resolved }
    }
    return { found: false, hasData: false, path: resolved }
  }

  try {
    const raw = fs.readFileSync(manifestPath, "utf-8")
    const manifest = JSON.parse(raw) as {
      name: string
      type: string
      container: string
      port: number
      dbUser: string
      dbPassword: string
      dbName: string
    }
    return { found: true, hasData: hasPgData, hasUploads, manifest, path: resolved }
  } catch {
    return { found: false, hasData: hasPgData, path: resolved }
  }
}

/**
 * Open a company from an existing data folder.
 * Starts the Docker container (or reuses existing) and adds the entity.
 */
export async function openFromFolderAction(folderPath: string) {
  const fs = await import("fs")
  const path = await import("path")

  const resolved = path.resolve(folderPath)
  const manifestPath = path.join(resolved, "taxinator.json")

  if (!fs.existsSync(manifestPath)) {
    return { success: false, error: "No taxinator.json found in this folder. Was it created by Taxinator?" }
  }

  let manifest: {
    name: string
    type: string
    container: string
    port: number
    dbUser: string
    dbPassword: string
    dbName: string
  }
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"))
  } catch {
    return { success: false, error: "Invalid taxinator.json" }
  }

  const { execFileSync } = await import("child_process")
  const containerName = manifest.container

  // Check Docker
  try {
    execFileSync("docker", ["info"], { timeout: 5000, stdio: "pipe" })
  } catch {
    return { success: false, error: "Docker is not available." }
  }

  // Check if container exists
  let containerRunning = false
  try {
    const status = execFileSync("docker", ["inspect", "-f", "{{.State.Running}}", containerName], {
      timeout: 5000, encoding: "utf-8",
    }).trim()
    containerRunning = status === "true"

    if (!containerRunning) {
      // Container exists but stopped — start it
      execFileSync("docker", ["start", containerName], { timeout: 10_000, stdio: "pipe" })
      containerRunning = true
    }
  } catch {
    // Container doesn't exist — create it
    const pgDataDir = path.join(resolved, "pgdata")
    try {
      execFileSync("docker", [
        "run", "-d",
        "--name", containerName,
        "-e", `POSTGRES_USER=${manifest.dbUser}`,
        "-e", `POSTGRES_PASSWORD=${manifest.dbPassword}`,
        "-e", `POSTGRES_DB=${manifest.dbName}`,
        "-v", `${pgDataDir}:/var/lib/postgresql/data`,
        "-p", `${manifest.port}:5432`,
        "--restart", "unless-stopped",
        "postgres:17-alpine",
      ], { timeout: 30_000, stdio: "pipe" })
    } catch (err) {
      return { success: false, error: `Failed to start database container: ${err instanceof Error ? err.message : "Unknown error"}` }
    }
  }

  // Wait for DB to be ready
  const connectionString = `postgresql://${manifest.dbUser}:${manifest.dbPassword}@localhost:${manifest.port}/${manifest.dbName}`
  let ready = false
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 1000))
    const test = await testDatabaseConnection(connectionString)
    if (test.ok) { ready = true; break }
  }

  if (!ready) {
    return { success: false, error: "Database container started but not ready. Try again." }
  }

  // Generate entity ID from name
  const { codeFromName } = await import("@/lib/utils")
  const entityId = codeFromName(manifest.name) || manifest.container.replace("taxinator-db-", "")

  // Add entity if not already present
  const existing = getEntities()
  if (!existing.some(e => e.id === entityId)) {
    addEntity({
      id: entityId,
      name: manifest.name,
      type: (manifest.type || "autonomo") as EntityType,
      db: connectionString,
      dataDir: resolved,
    })
  }

  return { success: true, entityId, name: manifest.name }
}
