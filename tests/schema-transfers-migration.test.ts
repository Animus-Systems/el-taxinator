import fs from "node:fs"
import net from "node:net"
import os from "node:os"
import path from "node:path"
import { randomUUID } from "node:crypto"

import EmbeddedPostgres from "embedded-postgres"
import pg, { type Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { ensureSchema, migrations, SCHEMA_VERSION } from "@/lib/schema"

// ---------------------------------------------------------------------------
// Real embedded-postgres cluster for exercising the v21 migration SQL.
//
// This is the one place where we intentionally hit a real Postgres cluster
// instead of `vi.mock("@/lib/pg")` — the whole point is to verify the raw
// SQL executes correctly and retrofits same-day opposite-sign pairs into
// first-class transfers.
// ---------------------------------------------------------------------------

type ClusterHandle = {
  pg: EmbeddedPostgres
  port: number
  user: string
  password: string
  dataDir: string
  baseDir: string
}

async function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (address && typeof address === "object") {
        const { port } = address
        server.close(() => resolve(port))
      } else {
        server.close()
        reject(new Error("Failed to allocate port"))
      }
    })
  })
}

async function startTestCluster(): Promise<ClusterHandle> {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "taxinator-transfers-mig-"))
  const dataDir = path.join(baseDir, "pgdata")
  const port = await pickFreePort()
  const password = randomUUID().replace(/-/g, "")
  const instance = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "taxinator",
    password,
    port,
    persistent: false,
  })
  await instance.initialise()
  await instance.start()
  await instance.createDatabase("taxinator")
  return { pg: instance, port, user: "taxinator", password, dataDir, baseDir }
}

async function stopTestCluster(handle: ClusterHandle): Promise<void> {
  try {
    await handle.pg.stop()
  } catch {
    // Non-persistent cluster drops its data on stop; errors here are not useful.
  }
  try {
    fs.rmSync(handle.baseDir, { recursive: true, force: true })
  } catch {
    // Best-effort cleanup.
  }
}

function buildConnectionString(handle: ClusterHandle, db: string): string {
  const encodedPassword = encodeURIComponent(handle.password)
  return `postgresql://${handle.user}:${encodedPassword}@127.0.0.1:${handle.port}/${encodeURIComponent(db)}`
}

// Minimal subset of the pre-v21 schema: just what the migration reads/updates.
// We seed schema_version to 20 so ensureSchema() runs *only* v21.
const PRE_V21_SCHEMA = `
  CREATE TABLE users (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    email text NOT NULL,
    name text NOT NULL
  );

  CREATE TABLE accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name text NOT NULL,
    currency_code text NOT NULL DEFAULT 'EUR',
    account_type text NOT NULL DEFAULT 'bank',
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE TABLE transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
    name text,
    total integer,
    currency_code text,
    type text DEFAULT 'expense',
    extra jsonb,
    issued_at timestamp(3),
    created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    status text NOT NULL DEFAULT 'business'
  );

  -- Minimal import_sessions stub so post-v21 migrations that ALTER this table
  -- (e.g. v24 adds context_file_ids) have something to attach to. The v21
  -- migration itself does not touch this table.
  CREATE TABLE import_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'pending',
    data jsonb NOT NULL DEFAULT '[]',
    created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  -- Minimal categories stub so post-v21 migrations that INSERT into this table
  -- (e.g. v25 backfills crypto_* defaults) have something to attach to. The
  -- v21 migration itself does not touch this table.
  CREATE TABLE categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code text NOT NULL,
    name jsonb,
    color text,
    llm_prompt text,
    tax_form_ref text,
    is_default boolean DEFAULT false,
    created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE (user_id, code)
  );

  -- Minimal tax_filings stub so post-v21 migrations that ALTER this table
  -- (e.g. v26 adds filed_amount_cents / confirmation_number / filing_source)
  -- have something to attach to. The v21 migration itself does not touch it.
  CREATE TABLE tax_filings (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    year int NOT NULL,
    quarter int NULL,
    modelo_code text NOT NULL,
    filed_at timestamp(3) NULL,
    checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
    notes text NULL,
    created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE TABLE schema_version (
    id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    version integer NOT NULL DEFAULT 1,
    migrated_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
  );
  INSERT INTO schema_version (id, version) VALUES (1, 20);
`

describe("schema v21: first-class transfers migration", () => {
  let cluster: ClusterHandle
  let pool: Pool

  beforeAll(async () => {
    cluster = await startTestCluster()
    pool = new pg.Pool({ connectionString: buildConnectionString(cluster, "taxinator") })
    await pool.query(PRE_V21_SCHEMA)
  }, 60_000)

  afterAll(async () => {
    if (pool) await pool.end()
    if (cluster) await stopTestCluster(cluster)
  })

  it("includes v21 in the declared migrations", () => {
    const v21 = migrations.find((m) => m.version === 21)
    expect(v21).toBeDefined()
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(21)
  })

  it("retrofits same-day opposite-sign pairs into first-class transfers", async () => {
    // ── Arrange: one user with two accounts and a transfer-like pair ────────
    const userRow = await pool.query<{ id: string }>(
      `INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id`,
      ["transfers@test.local", "Transfers Test"],
    )
    const userId = userRow.rows[0]?.id
    if (!userId) throw new Error("Failed to insert test user")

    const accountA = await pool.query<{ id: string }>(
      `INSERT INTO accounts (user_id, name, currency_code) VALUES ($1, $2, $3) RETURNING id`,
      [userId, "Account A", "EUR"],
    )
    const accountB = await pool.query<{ id: string }>(
      `INSERT INTO accounts (user_id, name, currency_code) VALUES ($1, $2, $3) RETURNING id`,
      [userId, "Account B", "EUR"],
    )
    const accountAId = accountA.rows[0]?.id
    const accountBId = accountB.rows[0]?.id
    if (!accountAId || !accountBId) throw new Error("Failed to insert test accounts")

    // Outgoing leg on account A (expense), incoming leg on account B (income).
    // Both ±1600.00 EUR on 2026-03-05. Plus a non-matching expense to ensure
    // we don't pair unrelated rows.
    const outgoing = await pool.query<{ id: string }>(
      `INSERT INTO transactions (user_id, account_id, name, total, currency_code, type, issued_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [userId, accountAId, "Transfer out to B", 160000, "EUR", "expense", "2026-03-05"],
    )
    const incoming = await pool.query<{ id: string }>(
      `INSERT INTO transactions (user_id, account_id, name, total, currency_code, type, issued_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [userId, accountBId, "Transfer in from A", 160000, "EUR", "income", "2026-03-05"],
    )
    const noisyExpense = await pool.query<{ id: string }>(
      `INSERT INTO transactions (user_id, account_id, name, total, currency_code, type, issued_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [userId, accountAId, "Unrelated coffee", 450, "EUR", "expense", "2026-03-05"],
    )
    const outgoingId = outgoing.rows[0]?.id
    const incomingId = incoming.rows[0]?.id
    const noisyId = noisyExpense.rows[0]?.id
    if (!outgoingId || !incomingId || !noisyId) throw new Error("Failed to insert fixtures")

    // ── Act: run ensureSchema to apply v21 ──────────────────────────────────
    const result = await ensureSchema(pool)
    expect(result.status).toBe("migrated")
    expect(result.toVersion).toBe(SCHEMA_VERSION)

    // ── Assert: both legs are now 'transfer' with shared transfer_id ────────
    const pairRows = await pool.query<{
      id: string
      type: string
      transfer_id: string | null
      transfer_direction: string | null
      counter_account_id: string | null
    }>(
      `SELECT id, type, transfer_id, transfer_direction, counter_account_id
       FROM transactions
       WHERE id = ANY($1::uuid[])
       ORDER BY id`,
      [[outgoingId, incomingId]],
    )
    const byId = new Map(pairRows.rows.map((r) => [r.id, r]))
    const outRow = byId.get(outgoingId)
    const inRow = byId.get(incomingId)
    expect(outRow).toBeDefined()
    expect(inRow).toBeDefined()
    if (!outRow || !inRow) throw new Error("Missing transfer rows")

    expect(outRow.type).toBe("transfer")
    expect(inRow.type).toBe("transfer")
    expect(outRow.transfer_id).toBeTruthy()
    expect(outRow.transfer_id).toBe(inRow.transfer_id)
    expect(outRow.transfer_direction).toBe("outgoing")
    expect(inRow.transfer_direction).toBe("incoming")
    expect(outRow.counter_account_id).toBe(accountBId)
    expect(inRow.counter_account_id).toBe(accountAId)

    // Unrelated expense must remain an expense, with no transfer fields set.
    const noisy = await pool.query<{
      type: string
      transfer_id: string | null
      transfer_direction: string | null
    }>(
      `SELECT type, transfer_id, transfer_direction FROM transactions WHERE id = $1`,
      [noisyId],
    )
    const noisyRow = noisy.rows[0]
    expect(noisyRow?.type).toBe("expense")
    expect(noisyRow?.transfer_id).toBeNull()
    expect(noisyRow?.transfer_direction).toBeNull()

    // Snapshot counts so we can detect duplicated work on idempotent re-run.
    const beforeCount = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM transactions WHERE type = 'transfer'`,
    )
    expect(beforeCount.rows[0]?.n).toBe("2")

    // ── Idempotency: re-apply the v21 migration body directly ──────────────
    // We bypass ensureSchema's per-connection cache by running the raw SQL,
    // which is the strongest possible idempotency check.
    const v21 = migrations.find((m) => m.version === 21)
    expect(v21).toBeDefined()
    if (!v21) throw new Error("v21 migration not found")
    await pool.query(v21.sql)

    const afterCount = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM transactions WHERE type = 'transfer'`,
    )
    expect(afterCount.rows[0]?.n).toBe("2")

    // transfer_id on the original pair must be unchanged after re-run.
    const reRun = await pool.query<{
      id: string
      transfer_id: string | null
    }>(
      `SELECT id, transfer_id FROM transactions WHERE id = ANY($1::uuid[]) ORDER BY id`,
      [[outgoingId, incomingId]],
    )
    const reRunIds = new Map(reRun.rows.map((r) => [r.id, r.transfer_id]))
    expect(reRunIds.get(outgoingId)).toBe(outRow.transfer_id)
    expect(reRunIds.get(incomingId)).toBe(inRow.transfer_id)
  }, 60_000)
})
