"use server"

import {
  getEntities,
  addEntity,
  updateEntity,
  removeEntity,
  reloadEntities,
  testDatabaseConnection,
  generateDockerComposeSnippet,
  closePoolForEntity,
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

  const cookieStore = await cookies()
  cookieStore.set(ENTITY_COOKIE, entityId, {
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
    sameSite: "lax",
  })

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

export async function removeEntityAction(id: string) {
  const entities = getEntities()
  if (entities.length <= 1) {
    return { success: false, error: "Cannot remove the last entity" }
  }

  try {
    await closePoolForEntity(id)
    removeEntity(id)

    // If we removed the active entity, switch to the first remaining one
    const cookieStore = await cookies()
    const current = cookieStore.get(ENTITY_COOKIE)?.value
    if (current === id) {
      const remaining = getEntities()
      if (remaining.length > 0) {
        cookieStore.set(ENTITY_COOKIE, remaining[0].id, {
          path: "/",
          maxAge: 365 * 24 * 60 * 60,
          sameSite: "lax",
        })
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

export async function getEntitiesAction() {
  return getEntities()
}

/**
 * Auto-provision a PostgreSQL database using Docker.
 * Requires the host to have Docker installed and the app to have access to the Docker socket.
 */
export async function autoProvisionDatabaseAction(data: { id: string; name: string }) {
  const slug = data.id.replace(/[^a-z0-9-]/g, "")
  const password = crypto.randomUUID().replace(/-/g, "")
  const containerName = `taxinator-db-${slug}`
  const port = 5432 + Math.floor(Math.random() * 1000) + 100

  try {
    const { execFileSync } = await import("child_process")

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

    // Create and start the container
    const dataDir = `${process.cwd()}/data/${slug}-pgdata`
    execFileSync("docker", [
      "run", "-d",
      "--name", containerName,
      "-e", `POSTGRES_USER=taxinator`,
      "-e", `POSTGRES_PASSWORD=${password}`,
      "-e", `POSTGRES_DB=taxinator`,
      "-v", `${dataDir}:/var/lib/postgresql/data`,
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
    return { success: true, connectionString, containerName, port }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to provision database" }
  }
}
