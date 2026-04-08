// Standalone smoke test for the embedded Postgres cluster.
// Boots the cluster, creates an entity database, runs a query, stops.
//
// Run with: node scripts/smoke-embedded-pg.mjs
// Set TAXINATOR_DATA_DIR to use a temp directory if you want a fresh run.

import EmbeddedPostgres from "embedded-postgres"
import pg from "pg"
import fs from "fs"
import net from "net"
import path from "path"
import { randomUUID } from "crypto"

const dataDir = path.resolve(process.env.TAXINATOR_DATA_DIR ?? "./data", "pgdata")
console.log(`[smoke] data directory: ${dataDir}`)

async function pickFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

const isInitialised = fs.existsSync(path.join(dataDir, "PG_VERSION"))
const port = await pickFreePort()
const password = randomUUID().replace(/-/g, "")

console.log(`[smoke] port=${port}, initialised=${isInitialised}`)

const instance = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "taxinator",
  password,
  port,
  persistent: true,
})

if (!isInitialised) {
  console.log("[smoke] running initdb...")
  await instance.initialise()
}

console.log("[smoke] starting cluster...")
await instance.start()
console.log("[smoke] cluster up")

// Connect to the default postgres database to create a test database
const adminUrl = `postgresql://taxinator:${encodeURIComponent(password)}@127.0.0.1:${port}/postgres`
const admin = new pg.Client({ connectionString: adminUrl })
await admin.connect()

const dbName = "smoke_test"
const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName])
if (exists.rowCount === 0) {
  await admin.query(`CREATE DATABASE "${dbName}"`)
  console.log(`[smoke] created database ${dbName}`)
} else {
  console.log(`[smoke] database ${dbName} already exists`)
}
await admin.end()

// Connect to the new DB and run a real query (the schema.sql `gen_random_uuid()` test)
const testUrl = `postgresql://taxinator:${encodeURIComponent(password)}@127.0.0.1:${port}/${dbName}`
const client = new pg.Client({ connectionString: testUrl })
await client.connect()

const versionResult = await client.query("SELECT version()")
console.log(`[smoke] ${versionResult.rows[0].version}`)

const uuidResult = await client.query("SELECT gen_random_uuid() AS id")
console.log(`[smoke] gen_random_uuid() = ${uuidResult.rows[0].id}`)

// Test jsonb @> containment (the operator Taxinator actually uses)
await client.query("CREATE TABLE IF NOT EXISTS smoke_jsonb (id serial PRIMARY KEY, files jsonb)")
await client.query("INSERT INTO smoke_jsonb (files) VALUES ('[\"abc\", \"def\"]'::jsonb)")
const jsonbResult = await client.query(
  "SELECT * FROM smoke_jsonb WHERE files @> $1::jsonb",
  [JSON.stringify(["abc"])],
)
console.log(`[smoke] jsonb @> matched ${jsonbResult.rowCount} row(s)`)

await client.query("DROP TABLE smoke_jsonb")
await client.end()

console.log("[smoke] stopping cluster...")
await instance.stop()
console.log("[smoke] done")
