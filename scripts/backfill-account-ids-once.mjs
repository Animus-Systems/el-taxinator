/**
 * One-shot backfill: link pre-existing transactions to the accounts that
 * were created after the imports ran. Pre-account imports left
 * transactions.account_id and import_sessions.account_id NULL.
 *
 * Strategy:
 *   - Each import_sessions row carries the extracted statement rows in its
 *     `data` JSONB column. Match those rows back to transactions on
 *     (name, total, currency_code, issued_at::date) — confirmed unique for
 *     this user.
 *   - Map each session's file_name to the account the user has confirmed:
 *       "BBVA" in file_name                 → BBVA Main
 *       otherwise (Revolut-style exports)   → Revolut Business
 *   - Update transactions.account_id and import_sessions.account_id.
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
  const accounts = await client.query(
    `SELECT id, name FROM accounts WHERE is_active = true`,
  )
  const byName = new Map(accounts.rows.map((a) => [a.name, a.id]))
  const bbva = byName.get("BBVA Main")
  const revolut = byName.get("Revolut Business")
  if (!bbva || !revolut) {
    throw new Error(
      `Missing expected accounts. Found: ${[...byName.keys()].join(", ")}`,
    )
  }

  const sessions = await client.query(
    `SELECT id, file_name, account_id, row_count
       FROM import_sessions
      WHERE account_id IS NULL
      ORDER BY created_at`,
  )

  if (sessions.rows.length === 0) {
    console.log("No import sessions missing account_id. Nothing to backfill.")
    process.exit(0)
  }

  console.log(`Found ${sessions.rows.length} session(s) without an account.\n`)

  for (const session of sessions.rows) {
    const accountId = session.file_name?.toLowerCase().includes("bbva")
      ? bbva
      : revolut
    const accountLabel = accountId === bbva ? "BBVA Main" : "Revolut Business"

    const matchStats = await client.query(
      `WITH session_rows AS (
         SELECT (r->>'name')::text             AS name,
                (r->>'total')::int             AS total,
                (r->>'currencyCode')::text     AS currency_code,
                (r->>'issuedAt')::date         AS issued_at_date
           FROM import_sessions s,
                jsonb_array_elements(s.data) AS r
          WHERE s.id = $1
       )
       SELECT COUNT(*) AS total_rows,
              COUNT(t.id) AS matched
         FROM session_rows sr
         LEFT JOIN transactions t
           ON t.name          = sr.name
          AND t.total         = sr.total
          AND t.currency_code = sr.currency_code
          AND t.issued_at::date = sr.issued_at_date
          AND t.account_id IS NULL`,
      [session.id],
    )
    const { total_rows, matched } = matchStats.rows[0]

    console.log(
      `Session ${session.id} (${session.file_name})\n  → ${accountLabel}\n  rows=${session.row_count} · session_rows=${total_rows} · matched unlinked tx=${matched}`,
    )

    if (!APPLY) continue

    await client.query("BEGIN")
    try {
      const upd = await client.query(
        `WITH session_rows AS (
           SELECT (r->>'name')::text             AS name,
                  (r->>'total')::int             AS total,
                  (r->>'currencyCode')::text     AS currency_code,
                  (r->>'issuedAt')::date         AS issued_at_date
             FROM import_sessions s,
                  jsonb_array_elements(s.data) AS r
            WHERE s.id = $1
         )
         UPDATE transactions t
            SET account_id = $2,
                updated_at = now()
           FROM session_rows sr
          WHERE t.account_id IS NULL
            AND t.name          = sr.name
            AND t.total         = sr.total
            AND t.currency_code = sr.currency_code
            AND t.issued_at::date = sr.issued_at_date
          RETURNING t.id`,
        [session.id, accountId],
      )
      await client.query(
        `UPDATE import_sessions SET account_id = $1 WHERE id = $2`,
        [accountId, session.id],
      )
      await client.query("COMMIT")
      console.log(`  ✓ linked ${upd.rowCount} transaction(s) and the session\n`)
    } catch (err) {
      await client.query("ROLLBACK")
      console.error(`  ✗ rollback: ${err.message}\n`)
      throw err
    }
  }

  const summary = await client.query(
    `SELECT COUNT(*) AS total,
            COUNT(account_id) AS with_account,
            COUNT(*) - COUNT(account_id) AS without_account
       FROM transactions`,
  )
  console.log("Post-run transaction status:")
  console.log(summary.rows[0])

  if (!APPLY) {
    console.log("\nDry run complete. Pass --apply to execute.")
  } else {
    console.log("\nBackfill complete.")
  }
} finally {
  await client.end()
}
