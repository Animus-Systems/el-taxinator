/**
 * Compatibility shim for @/lib/auth.
 *
 * Server-only auth functions. In the SPA, auth is handled differently.
 * These stubs allow transitive imports to load without crashing.
 */
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

export async function isConnected(): Promise<boolean> {
  // In the SPA, assume connected if we got this far
  return true
}

export async function getCurrentUser(): Promise<User> {
  throw new Error(
    "getCurrentUser() is a server-only function. " +
      "In the SPA, user data should be fetched via tRPC."
  )
}

export async function getSession() {
  // Return a stub session — the Fastify server handles real auth
  return null
}

export function isSubscriptionExpired(_user: User) {
  return false
}

export function isAiBalanceExhausted(_user: User) {
  return false
}
