/**
 * Compatibility shim for next/cache.
 *
 * Server-only cache functions that are no-ops in the SPA.
 */

export function revalidatePath(_path: string) {
  // no-op in SPA — React Query handles cache
}

export function revalidateTag(_tag: string) {
  // no-op
}
