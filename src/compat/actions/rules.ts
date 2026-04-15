/**
 * Compat layer for @/actions/rules — calls tRPC endpoints via fetch.
 *
 * Rules router uses authedProcedure. In self-hosted mode the Fastify
 * context always injects the self-hosted user, so no auth headers needed.
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

export async function addRuleAction(data: {
  name: string
  matchType: string
  matchField: string
  matchValue: string
  categoryCode?: string | null
  projectCode?: string | null
  type?: string | null
  status?: string | null
  note?: string | null
  priority?: number
}) {
  try {
    await trpcMutate("rules.create", data)
    return { success: true as const }
  } catch (e) {
    return { success: false as const, error: e instanceof Error ? e.message : "Failed to add rule" }
  }
}

export async function editRuleAction(id: string, data: Record<string, unknown>) {
  try {
    await trpcMutate("rules.update", { id, ...data })
    return { success: true as const }
  } catch (e) {
    return { success: false as const, error: e instanceof Error ? e.message : "Failed to edit rule" }
  }
}

export async function deleteRuleAction(id: string) {
  try {
    await trpcMutate("rules.delete", { id })
    return { success: true as const }
  } catch (e) {
    return { success: false as const, error: e instanceof Error ? e.message : "Failed to delete rule" }
  }
}

export async function toggleRuleAction(id: string, isActive: boolean) {
  try {
    await trpcMutate("rules.toggleActive", { id, isActive })
    return { success: true as const }
  } catch (e) {
    return { success: false as const, error: e instanceof Error ? e.message : "Failed to toggle rule" }
  }
}
