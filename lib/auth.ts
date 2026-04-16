import { getSelfHostedUser } from "@/models/users"
import { hasAnyEntities, getEntityById, getActiveEntityIdFromFile } from "@/lib/entities"
import type { User } from "@/lib/db-types"

export type UserProfile = {
  id: string
  name: string
  email: string
  avatar?: string
  membershipPlan: string
  storageUsed: number
  storageLimit: number
  aiBalance: number
}

/**
 * Check if a user is connected to an entity with a working database.
 * Returns true only if: active entity is in config and DB has the schema.
 */
export async function isConnected(): Promise<boolean> {
  const entityId = getActiveEntityIdFromFile()
  if (!entityId) return false
  const entity = getEntityById(entityId)
  if (!entity) return false

  // Verify the database is actually usable (has schema)
  try {
    const user = await getSelfHostedUser()
    return !!user
  } catch {
    return false
  }
}

/**
 * Get the current user from the active entity's database.
 * Throws if not connected (callers should redirect as appropriate).
 */
export async function getCurrentUser(): Promise<User> {
  if (!hasAnyEntities()) {
    throw new Error("No entities configured")
  }

  const connected = await isConnected()
  if (!connected) {
    throw new Error("Not connected to an entity")
  }

  try {
    const user = await getSelfHostedUser()
    if (user) {
      return user
    }
  } catch {
    // Database may not have schema yet (fresh DB)
  }

  throw new Error("No user found")
}

/**
 * Get session — returns user if connected, null otherwise.
 * Does not throw.
 */
export async function getSession() {
  const connected = await isConnected()
  if (!connected) return null

  try {
    const user = await getSelfHostedUser()
    return user ? { user } : null
  } catch {
    return null
  }
}

export function isSubscriptionExpired(_user: User) {
  return false // Self-hosted: never expires
}

export function isAiBalanceExhausted(_user: User) {
  return false // Self-hosted: unlimited
}
