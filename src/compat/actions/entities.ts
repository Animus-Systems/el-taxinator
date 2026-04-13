/**
 * Compat layer: entity actions call tRPC endpoints via fetch.
 *
 * Entities router uses publicProcedure — no auth required.
 * tRPC uses superjson, so responses are wrapped: {"result":{"data":{"json":...}}}
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

export async function getEntitiesAction() {
  try {
    return await trpcQuery<Array<{ id: string; name: string; type: string; db?: string; dataDir?: string }>>("entities.list")
  } catch {
    return []
  }
}

export async function listDirectoriesAction(dirPath: string) {
  try {
    return await trpcQuery<{
      current: string
      directories: string[]
      parent: string | null
      shortcuts: { name: string; path: string }[]
    }>("entities.listDirectories", { path: dirPath })
  } catch {
    return { current: dirPath, directories: [], parent: null, shortcuts: [] }
  }
}

export async function switchEntityAction(entityId: string) {
  try {
    return await trpcMutate<{ success: boolean; error?: string }>("entities.connect", { entityId })
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to switch entity" }
  }
}

export async function createLocalEntityAction(data: { name: string; type: string; dataDir?: string }) {
  try {
    return await trpcMutate<{ success: boolean; entityId?: string; error?: string }>("entities.create", data)
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to create entity" }
  }
}

export async function disconnectEntityAction(_entityId?: string) {
  try {
    return await trpcMutate<{ success: boolean; error?: string }>("entities.disconnect")
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to disconnect" }
  }
}

export async function removeEntityAction(entityId: string, deleteData = false) {
  try {
    return await trpcMutate<{ success: boolean; error?: string }>("entities.remove", { entityId, deleteData })
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to remove entity" }
  }
}

export async function scanForProfilesAction(dirPath: string) {
  try {
    return await trpcQuery<{ profiles: Array<{ name: string; path: string }> }>("entities.scanForProfiles", { path: dirPath })
  } catch {
    return { profiles: [] }
  }
}

export async function adoptProfilesAction(scanDir: string, profiles: Array<{ id: string; type: string }>) {
  try {
    return await trpcMutate<{ success: boolean; adopted: number; error?: string }>(
      "entities.adoptProfiles",
      { scanDir, profiles }
    )
  } catch (e) {
    return { success: false, adopted: 0, error: e instanceof Error ? e.message : "Failed to adopt profiles" }
  }
}

export async function updateEntityAction(entityId: string, data: Record<string, unknown>) {
  try {
    return await trpcMutate<{ success: boolean; error?: string }>("entities.update", { entityId, ...data })
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to update entity" }
  }
}

export async function addExternalEntityAction(..._args: unknown[]) {
  return { success: false, error: "Not implemented yet" }
}

export async function testConnectionAction(..._args: unknown[]) {
  return { success: false, error: "Not implemented yet" }
}
