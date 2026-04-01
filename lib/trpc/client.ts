/**
 * Client-side fetch helpers for the OpenAPI REST endpoints.
 *
 * These call the /api/v1/... routes (the OpenAPI adapter) directly,
 * making them usable from any client without needing the tRPC client library.
 */

type FetchOptions = {
  headers?: Record<string, string>
  signal?: AbortSignal
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts?: FetchOptions,
): Promise<T> {
  const url = `/api/v1${path}`

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...opts?.headers,
  }

  const init: RequestInit = {
    method,
    headers,
    signal: opts?.signal,
  }

  if (body !== undefined && method !== "GET") {
    init.body = JSON.stringify(body)
  }

  const res = await fetch(url, init)

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(error.message ?? `Request failed: ${res.status}`)
  }

  // Handle 204 No Content
  if (res.status === 204) {
    return undefined as T
  }

  return res.json() as Promise<T>
}

export function apiGet<T>(path: string, opts?: FetchOptions): Promise<T> {
  return request<T>("GET", path, undefined, opts)
}

export function apiPost<T>(path: string, body?: unknown, opts?: FetchOptions): Promise<T> {
  return request<T>("POST", path, body, opts)
}

export function apiPut<T>(path: string, body?: unknown, opts?: FetchOptions): Promise<T> {
  return request<T>("PUT", path, body, opts)
}

export function apiDelete<T>(path: string, opts?: FetchOptions): Promise<T> {
  return request<T>("DELETE", path, undefined, opts)
}

export function apiPatch<T>(path: string, body?: unknown, opts?: FetchOptions): Promise<T> {
  return request<T>("PATCH", path, body, opts)
}
