/**
 * Compat layer for @/actions/bundle — forwards bundle operations to the
 * Fastify API in SPA mode.
 */
type BundleManifest = {
  version: string
  entity: {
    id: string
    name: string
    type: "autonomo" | "sl"
  }
  created: string
  dbDumpFile: string
}

export async function readBundleManifestAction(..._args: unknown[]) {
  const [formData] = _args
  if (!(formData instanceof FormData)) {
    return {
      success: false as const,
      error: "Bundle file is required",
      manifest: undefined as BundleManifest | undefined,
    }
  }

  try {
    const response = await fetch(new URL("/api/bundle/manifest", window.location.origin).toString(), {
      method: "POST",
      body: formData,
    })
    const data = await response.json() as {
      success: boolean
      error?: string
      manifest?: BundleManifest
    }

    if (!response.ok) {
      return {
        success: false as const,
        error: data.error ?? "Failed to read bundle manifest",
        manifest: undefined as BundleManifest | undefined,
      }
    }

    return {
      success: data.success as true,
      ...(data.error !== undefined ? { error: data.error } : {}),
      ...(data.manifest !== undefined ? { manifest: data.manifest } : {}),
    }
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Failed to read bundle manifest",
      manifest: undefined as BundleManifest | undefined,
    }
  }
}

export async function importBundleAction(..._args: unknown[]) {
  const [formData] = _args
  if (!(formData instanceof FormData)) {
    return { success: false as const, error: "Bundle file is required" }
  }

  try {
    const response = await fetch(new URL("/api/bundle/import", window.location.origin).toString(), {
      method: "POST",
      body: formData,
    })
    const data = await response.json() as {
      success: boolean
      error?: string
      entityId?: string
    }

    if (!response.ok) {
      return {
        success: false as const,
        error: data.error ?? "Failed to import bundle",
      }
    }

    return {
      success: data.success as true,
      ...(data.error !== undefined ? { error: data.error } : {}),
      ...(data.entityId !== undefined ? { entityId: data.entityId } : {}),
    }
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Failed to import bundle",
    }
  }
}
