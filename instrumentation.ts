/**
 * Next.js instrumentation hook — runs once per server process before the
 * first request. We use it to boot the embedded PostgreSQL cluster for the
 * active entity so any route that calls getPool() finds it ready.
 *
 * Skipped on the Edge runtime (Postgres can't run there).
 */
export async function register() {
  if (process.env["NEXT_RUNTIME"] !== "nodejs") return

  const { getEntities, getActiveEntityIdFromFile } = await import("./lib/entities")
  const entities = getEntities()

  if (entities.length === 0) {
    console.log("[instrumentation] No entities configured — skipping cluster startup")
    return
  }

  const activeId = getActiveEntityIdFromFile()
  const entity = entities.find((e) => e.id === activeId) ?? entities[0]
  if (!entity) {
    console.log("[instrumentation] No entity available — skipping cluster startup")
    return
  }

  if (entity.db) {
    console.log(`[instrumentation] Entity "${entity.id}" uses external DB — skipping cluster startup`)
    return
  }

  const { startCluster } = await import("./lib/embedded-pg")
  await startCluster(entity.id, entity.dataDir)
}
