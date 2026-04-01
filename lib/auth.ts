import { getSelfHostedUser, SELF_HOSTED_USER } from "@/models/users"
import { hasAnyEntities, getEntityById } from "@/lib/entities"
import type { User } from "@/lib/db-types"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

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
 * Returns true only if: cookie exists, entity is in config, and DB has the schema.
 */
export async function isConnected(): Promise<boolean> {
  const cookieStore = await cookies()
  const entityId = cookieStore.get("TAXINATOR_ENTITY")?.value
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
 * Redirects to the entity picker (root page) if not connected.
 */
export async function getCurrentUser(): Promise<User> {
  if (!hasAnyEntities()) {
    redirect("/")
  }

  const connected = await isConnected()
  if (!connected) {
    redirect("/")
  }

  try {
    const user = await getSelfHostedUser()
    if (user) {
      return user
    }
  } catch {
    // Database may not have schema yet (fresh DB) — redirect to entity picker
    // which will run ensureSchema on connect
  }

  // No user or no schema — redirect to entity picker
  redirect("/")
}

/**
 * Get session — returns user if connected, null otherwise.
 * Does not redirect.
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
