/**
 * Compat stub for @/actions/bundle — server actions not available in SPA.
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
  return {
    success: false as const,
    error: "Server action not available in SPA mode",
    manifest: undefined as BundleManifest | undefined,
  }
}

export async function importBundleAction(..._args: unknown[]) {
  return { success: false as const, error: "Server action not available in SPA mode" }
}
