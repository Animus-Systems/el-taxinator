/**
 * Compat layer for @/actions/config — calls tRPC endpoints via fetch.
 *
 * The entity-picker imports getDataLocationAction, scanForProfilesAction,
 * and adoptProfilesAction from this module.
 */

async function trpcQuery<T = unknown>(procedure: string, input?: unknown): Promise<T> {
  const url = new URL("/api/trpc/" + procedure, window.location.origin)
  if (input !== undefined) {
    url.searchParams.set("input", JSON.stringify({ json: input }))
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`tRPC query failed: ${res.status}`)
  const json = await res.json()
  if (json?.result?.data?.json !== undefined) return json.result.data.json as T
  if (json?.result?.data !== undefined) return json.result.data as T
  if (json?.error) {
    const msg = json.error?.json?.message ?? json.error?.message ?? "Unknown tRPC error"
    throw new Error(msg)
  }
  throw new Error("Unexpected tRPC response format")
}

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
 * Returns the server's data root directory.
 * Used by entity-picker to show entity paths and as the initial folder browser path.
 */
export async function getDataLocationAction(): Promise<{ dataDir: string }> {
  try {
    return await trpcQuery<{ dataDir: string }>("entities.getDataRoot")
  } catch {
    // Fallback: if the endpoint doesn't exist, return a safe default
    return { dataDir: "/" }
  }
}

/**
 * Update the data location. No tRPC endpoint exists for this yet.
 */
export async function updateDataLocationAction(_path: string) {
  return { success: false, error: "Updating data location is not yet available in SPA mode" }
}

/**
 * Scan a directory for existing Taxinator profiles (folders with pgdata/PG_VERSION).
 * Called by entity-picker's folder scanner.
 *
 * The tRPC endpoint returns { profiles: [{ name, path }] }.
 * The entity-picker spreads these into DiscoveredProfile objects that need `id`.
 * We map `name` -> `id` to match the expected shape.
 */
export async function scanForProfilesAction(dirPath: string): Promise<{
  profiles: Array<{ id: string; name: string; path: string; hasDb: boolean }>
}> {
  try {
    const result = await trpcQuery<{
      profiles: Array<{ name: string; path: string }>
    }>("entities.scanForProfiles", { path: dirPath })

    return {
      profiles: result.profiles.map((p) => ({
        id: p.name,
        name: p.name,
        path: p.path,
        hasDb: true, // presence of pgdata/PG_VERSION means has DB
      })),
    }
  } catch {
    return { profiles: [] }
  }
}

/**
 * Adopt discovered profiles — register them as entities.
 * Called by entity-picker after scanning. Receives the scan directory
 * and selected profiles with id and type.
 */
export async function adoptProfilesAction(
  scanDir: string,
  profiles: Array<{ id: string; type: string }>,
): Promise<{ success: boolean; adopted?: number; error?: string }> {
  try {
    const result = await trpcMutate<{
      success: boolean
      adopted: number
      error?: string
    }>("entities.adoptProfiles", { scanDir, profiles })
    return result
  } catch (e) {
    return { success: false, adopted: 0, error: e instanceof Error ? e.message : "Failed to adopt profiles" }
  }
}
