"use server"

import {
  addEntity,
  getEntities,
  getEntityById,
  getPoolForEntity,
  setActiveEntity,
  testDatabaseConnection,
  ENTITY_COOKIE,
  type EntityType,
} from "@/lib/entities"
import { ensureSchema } from "@/lib/schema"
import { getSelfHostedUser, getOrCreateSelfHostedUser } from "@/models/users"
import { createUserDefaults, isDatabaseEmpty } from "@/models/defaults-server"
import { codeFromName } from "@/lib/utils"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

/**
 * Connect to an existing entity. Tests the DB connection, sets the cookie,
 * ensures the self-hosted user and defaults exist, then redirects to dashboard.
 */
export async function connectAction(entityId: string) {
  const entity = getEntityById(entityId)
  if (!entity) {
    return { success: false, error: "Company not found" }
  }

  // For external connections, test the URL up front so we can show a clear
  // error before touching the pool. Embedded entities don't need this — the
  // pool itself will create the database lazily.
  if (entity.db) {
    const test = await testDatabaseConnection(entity.db)
    if (!test.ok) {
      return { success: false, error: `Cannot connect: ${test.error}` }
    }
  }

  // Ensure database has the Taxinator schema (tables). For embedded
  // entities this is also where the per-entity database first gets created.
  try {
    const pool = await getPoolForEntity(entityId)
    await ensureSchema(pool)
  } catch (error) {
    return { success: false, error: `Failed to initialize database schema: ${error instanceof Error ? error.message : "Unknown error"}` }
  }

  await setActiveEntity(entityId)

  // Ensure the self-hosted user and defaults exist (also updates i18n values)
  try {
    const user = await getOrCreateSelfHostedUser()
    await createUserDefaults(user.id)
  } catch (error) {
    console.error("Failed to initialize user:", error)
    return { success: false, error: "Database schema is ready but failed to create user. Please try connecting again." }
  }

  return { success: true }
}

/**
 * Disconnect from the current entity. Clears the cookie.
 */
export async function disconnectAction() {
  const cookieStore = await cookies()
  cookieStore.delete(ENTITY_COOKIE)
  redirect("/")
}

/**
 * Add a new company and connect to it immediately.
 *
 * If `connectionString` is omitted (the standard self-hosted path), the new
 * entity uses its own database in the embedded Postgres cluster. Pass a
 * connection string only when pointing at an external Postgres.
 */
export async function addAndConnectAction(data: {
  name: string
  type: EntityType
  connectionString?: string
  dataDir?: string
}) {
  if (!data.name) return { success: false, error: "Company name is required" }

  // If a connection string was provided (advanced path), validate it now.
  if (data.connectionString) {
    const test = await testDatabaseConnection(data.connectionString)
    if (!test.ok) {
      return { success: false, error: `Cannot connect to database: ${test.error}` }
    }
  }

  // Generate ID and save
  const id = codeFromName(data.name)
  if (!id) return { success: false, error: "Invalid company name" }

  // Check for duplicate
  const existing = getEntities()
  if (existing.some((e) => e.id === id)) {
    return { success: false, error: `A company with this name already exists` }
  }

  try {
    addEntity({
      id,
      name: data.name,
      type: data.type,
      db: data.connectionString,
      dataDir: data.dataDir,
    })
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to save company" }
  }

  // Connect to it (this will boot the embedded cluster + create the per-entity DB if needed)
  const connectResult = await connectAction(id)
  if (!connectResult.success) {
    return connectResult
  }

  return { success: true, entityId: id }
}
