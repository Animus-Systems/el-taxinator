export type CompatActionResult<T = unknown> = {
  success: boolean
  error?: string
  data?: T
}

export async function trpcQuery<T = unknown>(procedure: string, input?: unknown): Promise<T> {
  const url = new URL(`/api/trpc/${procedure}`, window.location.origin)
  if (input !== undefined) {
    url.searchParams.set("input", JSON.stringify({ json: input }))
  }

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`tRPC query failed: ${res.status}`)
  }

  const json = await res.json()
  if (json?.result?.data?.json !== undefined) return json.result.data.json as T
  if (json?.result?.data !== undefined) return json.result.data as T
  if (json?.error) {
    const msg = json.error?.json?.message ?? json.error?.message ?? "Unknown tRPC error"
    throw new Error(msg)
  }

  throw new Error("Unexpected tRPC response format")
}

export async function trpcMutate<T = unknown>(procedure: string, input?: unknown): Promise<T> {
  const url = new URL(`/api/trpc/${procedure}`, window.location.origin)
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input !== undefined ? { json: input } : { json: undefined }),
  })

  if (!res.ok) {
    throw new Error(`tRPC mutation failed: ${res.status}`)
  }

  const json = await res.json()
  if (json?.result?.data?.json !== undefined) return json.result.data.json as T
  if (json?.result?.data !== undefined) return json.result.data as T
  if (json?.error) {
    const msg = json.error?.json?.message ?? json.error?.message ?? "Unknown tRPC error"
    throw new Error(msg)
  }

  throw new Error("Unexpected tRPC response format")
}

export function formDataToObject(formData: FormData): Record<string, unknown> {
  const object: Record<string, unknown> = {}

  for (const [key, rawValue] of formData.entries()) {
    const value = typeof rawValue === "string" ? rawValue.trim() : rawValue

    if (object[key] !== undefined) {
      const existing = object[key]
      object[key] = Array.isArray(existing) ? [...existing, value] : [existing, value]
      continue
    }

    object[key] = value
  }

  return object
}

export function parseJsonField<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value.length === 0) {
    return fallback
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

export function nullableStringValue(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value !== "string") return undefined
  return value.length > 0 ? value : null
}

export function numberValue(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined
  if (typeof value !== "string" || value.length === 0) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value
  if (typeof value !== "string") return undefined
  if (value === "true" || value === "on" || value === "1") return true
  if (value === "false" || value === "off" || value === "0") return false
  return undefined
}
