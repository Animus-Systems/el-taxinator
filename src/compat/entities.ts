/**
 * Compatibility shim for @/lib/entities.
 *
 * Entity management is server-only. This stub provides all exports
 * so that transitive imports don't crash at module-load time.
 * Functions throw or return defaults — they're never called at runtime in the SPA.
 */

export type EntityType = "autonomo" | "sl"

export type Entity = {
  id: string
  name: string
  type: EntityType
  db?: string
  dataDir?: string
}

export const ENTITY_COOKIE = "TAXINATOR_ENTITY"

export function getEntities(): Entity[] {
  return []
}

export function reloadEntities(): void {
  // no-op
}

export function getEntityById(_id: string): Entity | undefined {
  return undefined
}

export function resolveEntityDir(_entityId: string): string {
  return ""
}

export function isMultiEntity(): boolean {
  return false
}

export function hasAnyEntities(): boolean {
  return true
}

export function saveEntities(_entities: Entity[]): void {
  // no-op
}

export function addEntity(_entity: Entity): void {
  // no-op
}

export function updateEntity(_id: string, _updates: Partial<Omit<Entity, "id">>): void {
  // no-op
}

export function removeEntity(_id: string): void {
  // no-op
}

export function clearActiveEntityFile(): void {
  // no-op
}

export function getActiveEntityIdFromFile(): string {
  return ""
}

export async function setActiveEntity(_entityId: string): Promise<void> {
  // no-op
}

export async function getActiveEntityId(): Promise<string> {
  // Read from cookie
  const match = document.cookie.match(/TAXINATOR_ENTITY=([^;]+)/)
  return match?.[1] ?? ""
}

export async function getActiveEntity(): Promise<Entity> {
  return { id: "", name: "", type: "autonomo" }
}

export async function getPoolForEntity(_entityId: string): Promise<never> {
  throw new Error("getPoolForEntity() is server-only")
}

export async function closeAllPools(): Promise<void> {
  // no-op
}

export async function closePoolForEntity(_entityId: string): Promise<void> {
  // no-op
}

export async function shutdownRunningEntitySession(): Promise<void> {
  // no-op
}

export async function getPool(): Promise<never> {
  throw new Error("getPool() is server-only")
}

export async function testDatabaseConnection(_connectionString: string): Promise<{ ok: boolean; error?: string }> {
  return { ok: false, error: "testDatabaseConnection() is server-only" }
}
