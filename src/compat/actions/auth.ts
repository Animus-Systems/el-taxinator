/**
 * Compat layer for @/actions/auth — calls tRPC endpoints via fetch.
 *
 * Used by entity-picker: connectAction, addAndConnectAction.
 */

async function trpcMutate<T = unknown>(procedure: string, input?: unknown): Promise<T> {
  const url = new URL("/api/trpc/" + procedure, window.location.origin)
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input !== undefined ? { json: input } : { json: undefined }),
  })
  if (!res.ok) throw new Error(`tRPC mutation failed: ${res.status}`)
  const json = await res.json()
  if (json?.result?.data?.json !== undefined) return json.result.data.json as T
  if (json?.result?.data !== undefined) return json.result.data as T
  if (json?.error) {
    const msg = json.error?.json?.message ?? json.error?.message ?? "Unknown tRPC error"
    throw new Error(msg)
  }
  throw new Error("Unexpected tRPC response format")
}

/**
 * Connect to an entity (start its embedded Postgres cluster, ensure schema).
 * Returns { success, error?, schema? }.
 */
export async function connectAction(entityId: string): Promise<{
  success: boolean
  error?: string
  schema?: { status: string; migrationsRan?: number; descriptions?: string[] }
}> {
  try {
    const result = await trpcMutate<{ success: boolean; error?: string }>(
      "entities.connect",
      { entityId },
    )
    return result
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to connect" }
  }
}

/**
 * Disconnect the current entity session.
 */
export async function disconnectAction(): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await trpcMutate<{ success: boolean; error?: string }>("entities.disconnect")
    // Also clear the local cookie
    document.cookie = "TAXINATOR_ENTITY=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT"
    return result
  } catch {
    // Even if the server call fails, clear local state
    document.cookie = "TAXINATOR_ENTITY=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT"
    window.location.href = "/"
    return { success: true }
  }
}

/**
 * Create a new entity and immediately connect to it.
 * Used by the AddCompanyForm in entity-picker.
 */
export async function addAndConnectAction(data: {
  name: string
  type?: string
  dataDir?: string
}): Promise<{ success: boolean; error?: string; entityId?: string }> {
  try {
    // Step 1: Create the entity
    const createResult = await trpcMutate<{
      success: boolean
      entityId?: string
      error?: string
    }>("entities.create", {
      name: data.name,
      type: data.type ?? "autonomo",
      dataDir: data.dataDir,
    })

    if (!createResult.success) {
      return { success: false, error: createResult.error ?? "Failed to create entity" }
    }

    return { success: true, entityId: createResult.entityId }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to create and connect" }
  }
}
