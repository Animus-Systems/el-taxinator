/**
 * Next.js instrumentation hook — runs once per server process before the
 * first request. We use it to boot the embedded PostgreSQL cluster so any
 * route that calls getPool() finds it ready.
 *
 * Skipped on the Edge runtime (Postgres can't run there).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  const { startCluster } = await import("./lib/embedded-pg")
  await startCluster()
}
