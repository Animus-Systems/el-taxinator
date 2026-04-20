/**
 * One-shot backfill: reclassify existing transfer/conversion rows from
 * status='personal_ignored' to status='internal'. Pre-enum-change imports
 * used the ambiguous "Personal (ignored)" bucket for in-account FX moves and
 * own-account transfers; the new `internal` bucket is the accurate label.
 *
 * Only touches rows where type IN ('transfer','conversion') AND status =
 * 'personal_ignored' — genuinely personal deposits / reversals stay put.
 *
 * Also rewrites the same classification inside import_sessions.data JSONB
 * (per-candidate status) so the wizard resume view and committed-session
 * report reflect the new bucket.
 *
 * Dry-run by default. Pass --apply to execute.
 */
import { Client } from "pg"
import fs from "fs"
import path from "path"

const DATA_ROOT = "/Users/seth/Library/CloudStorage/GoogleDrive-marcin@animus.group/Shared drives/accounts/Taxinator-Data"
const entityId = fs.readFileSync(path.join(DATA_ROOT, "active-entity"), "utf-8").trim()
const runtime = JSON.parse(
  fs.readFileSync(path.join(DATA_ROOT, entityId, "runtime.json"), "utf-8"),
)

const APPLY = process.argv.includes("--apply")

const client = new Client({
  host: "127.0.0.1",
  port: runtime.port,
  user: "taxinator",
  password: runtime.password,
  database: "taxinator",
})

await client.connect()

try {
  const txPreview = await client.query(
    `SELECT id, type, name, total, currency_code, issued_at
       FROM transactions
      WHERE type IN ('transfer', 'conversion')
        AND status = 'personal_ignored'
      ORDER BY issued_at`,
  )
  console.log(`Transactions to reclassify: ${txPreview.rowCount}`)
  for (const r of txPreview.rows) {
    console.log(
      `  ${r.type.padEnd(10)} ${r.id}  ${r.currency_code}  ${r.total}  ${new Date(r.issued_at).toISOString().slice(0, 10)}  ${r.name}`,
    )
  }

  // Count how many candidates inside import_sessions.data would flip.
  const sessionStats = await client.query(
    `SELECT s.id,
            s.file_name,
            (SELECT COUNT(*)
               FROM jsonb_array_elements(s.data) r
              WHERE r->>'type' IN ('transfer', 'conversion')
                AND r->>'status' = 'personal_ignored') AS candidates
       FROM import_sessions s
      WHERE s.data IS NOT NULL
      ORDER BY s.created_at`,
  )
  const sessionHits = sessionStats.rows.filter((r) => Number(r.candidates) > 0)
  console.log(
    `\nImport sessions with transfer/conversion candidates still at personal_ignored: ${sessionHits.length}`,
  )
  for (const r of sessionHits) {
    console.log(`  ${r.id} (${r.file_name}) · ${r.candidates} candidate(s)`)
  }

  if (!APPLY) {
    console.log("\nDry run complete. Pass --apply to execute.")
    process.exit(0)
  }

  await client.query("BEGIN")
  try {
    const txUpd = await client.query(
      `UPDATE transactions
          SET status = 'internal',
              updated_at = now()
        WHERE type IN ('transfer', 'conversion')
          AND status = 'personal_ignored'`,
    )
    console.log(`\n✓ updated ${txUpd.rowCount} transaction(s)`)

    // Rewrite session candidate statuses in-place. We walk each flagged
    // session's data array and flip the matching rows.
    let sessionUpdates = 0
    for (const row of sessionHits) {
      const cur = await client.query(
        `SELECT data FROM import_sessions WHERE id = $1`,
        [row.id],
      )
      const data = cur.rows[0]?.data ?? []
      const next = data.map((c) =>
        (c?.type === "transfer" || c?.type === "conversion") &&
        c?.status === "personal_ignored"
          ? { ...c, status: "internal" }
          : c,
      )
      await client.query(
        `UPDATE import_sessions SET data = $1::jsonb WHERE id = $2`,
        [JSON.stringify(next), row.id],
      )
      sessionUpdates += 1
    }
    console.log(`✓ rewrote ${sessionUpdates} session data blob(s)`)

    await client.query("COMMIT")
  } catch (err) {
    await client.query("ROLLBACK")
    console.error(`✗ rollback: ${err.message}`)
    throw err
  }

  const verify = await client.query(
    `SELECT type, status, COUNT(*) AS n
       FROM transactions
      WHERE type IN ('transfer', 'conversion')
      GROUP BY type, status
      ORDER BY type, status`,
  )
  console.log("\nPost-run transfer/conversion status distribution:")
  for (const r of verify.rows) {
    console.log(`  ${r.type.padEnd(10)}  ${r.status.padEnd(20)}  ${r.n}`)
  }
  console.log("\nBackfill complete.")
} finally {
  await client.end()
}
