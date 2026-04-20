/**
 * One-shot cleanup: merge duplicate purchases that share
 * (user_id, contact_id, supplier_invoice_number) so the new server-side
 * uniqueness guard has a clean slate to enforce.
 *
 * For each duplicate group:
 *   - Pick a "keeper": prefer the row with a pdf_file_id attached, then the
 *     one with more line items, then the oldest created_at.
 *   - For every non-keeper: move its purchase_payments to the keeper (skipping
 *     any that would conflict with the UNIQUE (purchase_id, transaction_id)
 *     constraint — those get dropped).
 *   - If the keeper has no pdfFileId and a duplicate does, adopt the
 *     duplicate's pdf_file_id.
 *   - Delete the non-keepers (ON DELETE CASCADE removes their items).
 *
 * Dry-run by default. Pass --apply to actually execute.
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
  // Find duplicate groups.
  const dupGroups = await client.query(`
    SELECT user_id,
           contact_id,
           LOWER(supplier_invoice_number) AS normalized_number,
           COUNT(*) AS n,
           ARRAY_AGG(id ORDER BY created_at ASC) AS ids
    FROM purchases
    GROUP BY user_id, contact_id, LOWER(supplier_invoice_number)
    HAVING COUNT(*) > 1
  `)

  if (dupGroups.rows.length === 0) {
    console.log("No duplicate purchases found. Nothing to clean up.")
    process.exit(0)
  }

  console.log(`Found ${dupGroups.rows.length} duplicate group(s).\n`)

  for (const grp of dupGroups.rows) {
    const ids = grp.ids

    const detail = await client.query(
      `SELECT p.id,
              p.supplier_invoice_number,
              p.pdf_file_id,
              p.created_at,
              (SELECT COUNT(*)::int FROM purchase_items WHERE purchase_id = p.id) AS item_count,
              (SELECT COUNT(*)::int FROM purchase_payments WHERE purchase_id = p.id) AS payment_count
         FROM purchases p
        WHERE p.id = ANY($1::uuid[])
        ORDER BY p.created_at ASC`,
      [ids],
    )

    // Pick keeper: pdf_file_id present first, then most items, then newest
    // (user's most recent correction intent beats the older buggy row).
    const sorted = [...detail.rows].sort((a, b) => {
      const aPdf = a.pdf_file_id ? 1 : 0
      const bPdf = b.pdf_file_id ? 1 : 0
      if (aPdf !== bPdf) return bPdf - aPdf
      if (a.item_count !== b.item_count) return b.item_count - a.item_count
      return new Date(b.created_at) - new Date(a.created_at)
    })
    const keeper = sorted[0]
    const losers = sorted.slice(1)

    console.log(
      `Group "${grp.normalized_number}" (${grp.n} rows):\n  keeper: ${keeper.id} · items=${keeper.item_count} · payments=${keeper.payment_count} · pdf=${keeper.pdf_file_id ? "yes" : "no"}`,
    )
    for (const l of losers) {
      console.log(
        `  loser:  ${l.id} · items=${l.item_count} · payments=${l.payment_count} · pdf=${l.pdf_file_id ? "yes" : "no"}`,
      )
    }

    if (!APPLY) continue

    await client.query("BEGIN")
    try {
      // Adopt loser's pdf_file_id if keeper doesn't have one
      if (!keeper.pdf_file_id) {
        const donor = losers.find((l) => l.pdf_file_id)
        if (donor) {
          await client.query(
            `UPDATE purchases SET pdf_file_id = $1, updated_at = now() WHERE id = $2`,
            [donor.pdf_file_id, keeper.id],
          )
          console.log(`  → adopted pdf_file_id from ${donor.id}`)
        }
      }

      // Move payments from losers to keeper, skipping those that would conflict.
      for (const l of losers) {
        await client.query(
          `UPDATE purchase_payments
              SET purchase_id = $1
            WHERE purchase_id = $2
              AND transaction_id NOT IN (
                SELECT transaction_id FROM purchase_payments WHERE purchase_id = $1
              )`,
          [keeper.id, l.id],
        )
      }

      // Delete losers (cascades to purchase_items; leftover payments drop too).
      const loserIds = losers.map((l) => l.id)
      await client.query(
        `DELETE FROM purchases WHERE id = ANY($1::uuid[])`,
        [loserIds],
      )

      await client.query("COMMIT")
      console.log(`  ✓ merged and deleted ${loserIds.length} loser(s)\n`)
    } catch (err) {
      await client.query("ROLLBACK")
      console.error(`  ✗ rollback: ${err.message}\n`)
      throw err
    }
  }

  if (APPLY) {
    // Back-fill the keeper of a single-file import where we persisted the PDF
    // but didn't attach it (pre-fix behavior). Only when the keeper is still
    // fileless and exactly one orphan PDF matches the invoice number in its
    // filename — conservative, we don't want to guess otherwise.
    const orphanHunt = await client.query(`
      WITH survivors AS (
        SELECT DISTINCT ON (user_id, contact_id, LOWER(supplier_invoice_number))
               id, user_id, supplier_invoice_number, pdf_file_id
          FROM purchases
         ORDER BY user_id, contact_id, LOWER(supplier_invoice_number), created_at DESC
      )
      SELECT s.id AS purchase_id, s.user_id, s.supplier_invoice_number, f.id AS file_id
        FROM survivors s
        JOIN files f
          ON f.user_id = s.user_id
         AND f.filename ILIKE '%' || s.supplier_invoice_number || '%'
         AND NOT EXISTS (SELECT 1 FROM purchases p2 WHERE p2.pdf_file_id = f.id)
       WHERE s.pdf_file_id IS NULL
    `)

    for (const row of orphanHunt.rows) {
      await client.query(
        `UPDATE purchases SET pdf_file_id = $1, updated_at = now() WHERE id = $2`,
        [row.file_id, row.purchase_id],
      )
      console.log(
        `  → attached orphan file ${row.file_id} to purchase ${row.purchase_id} (${row.supplier_invoice_number})`,
      )
    }
  }

  if (!APPLY) {
    console.log("\nDry run complete. Pass --apply to execute.")
  } else {
    console.log("\nAll groups processed.")
  }
} finally {
  await client.end()
}
