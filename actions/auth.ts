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

  // Test the connection
  const test = await testDatabaseConnection(entity.db)
  if (!test.ok) {
    return { success: false, error: `Cannot connect: ${test.error}` }
  }

  // Ensure database has the Taxinator schema (tables)
  try {
    const pool = getPoolForEntity(entityId)
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
 */
export async function addAndConnectAction(data: {
  name: string
  type: EntityType
  connectionString: string
  dataDir?: string
}) {
  if (!data.name) return { success: false, error: "Company name is required" }
  if (!data.connectionString) return { success: false, error: "Database connection is required" }

  // Test connection first
  const test = await testDatabaseConnection(data.connectionString)
  if (!test.ok) {
    return { success: false, error: `Cannot connect to database: ${test.error}` }
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
    addEntity({ id, name: data.name, type: data.type, db: data.connectionString, dataDir: data.dataDir })
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to save company" }
  }

  // Connect to it
  const connectResult = await connectAction(id)
  if (!connectResult.success) {
    return connectResult
  }

  return { success: true, entityId: id }
}
