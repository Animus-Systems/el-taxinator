/**
 * Shared income-sources cache — a JSON file sitting next to `entities.json`
 * that lists income_sources across all per-entity clusters. Each entity has
 * its own DB (strict isolation), so querying other entities' DBs at runtime
 * is expensive (only one embedded cluster runs at a time). This cache is
 * populated on create/update so other entities can offer a "copy from
 * another profile" shortcut without starting a second cluster.
 *
 * The file is best-effort: losing it does not break anything — the cache
 * is rebuilt as the user creates/edits sources in each entity.
 */
import fs from "node:fs"
import path from "node:path"

export type SharedIncomeSourceKind =
  | "salary"
  | "rental"
  | "dividend"
  | "interest"
  | "other"

export type SharedIncomeSource = {
  entityId: string
  entityName: string
  id: string
  kind: SharedIncomeSourceKind
  name: string
  taxId: string | null
  metadata: Record<string, unknown>
  updatedAt: string
}

function getSharedFilePath(): string {
  const override = process.env["SHARED_INCOME_SOURCES_FILE"]
  if (override) return override
  const entitiesFile =
    process.env["ENTITIES_FILE"] ?? path.join(process.cwd(), "data", "entities.json")
  return path.join(path.dirname(entitiesFile), "shared-income-sources.json")
}

type FileShape = { sources: SharedIncomeSource[] }

function readFile(): FileShape {
  try {
    const raw = fs.readFileSync(getSharedFilePath(), "utf-8")
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as FileShape).sources)) {
      return { sources: (parsed as FileShape).sources }
    }
  } catch {
    // fall through — file missing or invalid JSON
  }
  return { sources: [] }
}

function writeFile(data: FileShape): void {
  const filePath = getSharedFilePath()
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
  } catch (err) {
    console.warn("[shared-income-sources] write failed:", err)
  }
}

/**
 * Record (create or update) an income source in the shared cache. Idempotent
 * on (entityId, id). Called after successful DB write in the tRPC router.
 */
export function recordSharedIncomeSource(src: SharedIncomeSource): void {
  const data = readFile()
  const idx = data.sources.findIndex((s) => s.entityId === src.entityId && s.id === src.id)
  if (idx >= 0) {
    data.sources[idx] = src
  } else {
    data.sources.push(src)
  }
  writeFile(data)
}

/**
 * Remove a source from the shared cache (on delete). No-op if not found.
 */
export function forgetSharedIncomeSource(entityId: string, id: string): void {
  const data = readFile()
  const next = data.sources.filter((s) => !(s.entityId === entityId && s.id === id))
  if (next.length === data.sources.length) return
  writeFile({ sources: next })
}

/**
 * Drop every shared source for an entity (on entity delete).
 */
export function forgetSharedIncomeSourcesForEntity(entityId: string): void {
  const data = readFile()
  const next = data.sources.filter((s) => s.entityId !== entityId)
  if (next.length === data.sources.length) return
  writeFile({ sources: next })
}

export function listSharedIncomeSources(options?: {
  excludeEntityId?: string
  kind?: SharedIncomeSourceKind
}): SharedIncomeSource[] {
  const { sources } = readFile()
  return sources.filter((s) => {
    if (options?.excludeEntityId && s.entityId === options.excludeEntityId) return false
    if (options?.kind && s.kind !== options.kind) return false
    return true
  })
}
