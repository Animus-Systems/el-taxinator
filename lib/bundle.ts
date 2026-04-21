import { getEntities, type Entity } from "@/lib/entities"
import { getDataRoot, getEmbeddedConnectionString, withEntityDb } from "@/lib/embedded-pg"
import { getUserUploadsDirectory } from "@/lib/files"
import { execFileSync } from "child_process"
import { existsSync } from "fs"
import fs from "fs/promises"
import JSZip from "jszip"
import path from "path"

const MAX_FILE_SIZE = 64 * 1024 * 1024 // 64MB per file

/**
 * Recursively read all files in a directory, returning relative paths and buffers.
 * Skips files larger than MAX_FILE_SIZE.
 */
export async function readDirRecursive(
  dir: string,
  base: string = dir,
): Promise<{ relativePath: string; buffer: Buffer }[]> {
  const results: { relativePath: string; buffer: Buffer }[] = []
  if (!existsSync(dir)) return results

  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...await readDirRecursive(fullPath, base))
    } else if (entry.isFile()) {
      const stat = await fs.stat(fullPath)
      if (stat.size <= MAX_FILE_SIZE) {
        results.push({ relativePath: path.relative(base, fullPath), buffer: await fs.readFile(fullPath) })
      }
    }
  }
  return results
}

function runPgDump(connectionString: string): string {
  return execFileSync("pg_dump", [
    "--no-owner", "--no-privileges", "--no-comments", "--clean", "--if-exists", connectionString,
  ], { timeout: 180_000, encoding: "utf-8", maxBuffer: 500 * 1024 * 1024 })
}

/**
 * Create a portable .taxinator.zip bundle for a single entity. Still used by
 * the per-entity "export" action on `/settings/backups`.
 * Contains: manifest.json + database.sql (pg_dump) + uploads/
 */
export async function createBundle(entity: Entity): Promise<Buffer> {
  // Run pg_dump — use external DB URL if set, otherwise the embedded cluster
  const connectionString = entity.db ?? getEmbeddedConnectionString()
  const dbDump = runPgDump(connectionString)

  const zip = new JSZip()

  zip.file("manifest.json", JSON.stringify({
    version: "2.0",
    entity: { id: entity.id, name: entity.name, type: entity.type },
    created: new Date().toISOString(),
    dbDumpFile: "database.sql",
  }, null, 2))

  zip.file("database.sql", dbDump)

  // Add user uploads
  const uploadsDir = getUserUploadsDirectory(entity.id)
  const files = await readDirRecursive(uploadsDir)
  for (const { relativePath, buffer } of files) {
    zip.file(`uploads/${relativePath}`, buffer)
  }

  const zipBuffer = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  })

  return Buffer.from(zipBuffer)
}

/**
 *  Create a portable .taxinator.zip bundle covering EVERY configured entity.
 *  Used by the scheduled backup so a single Google-Drive upload contains the
 *  complete Taxinator state: every entity's database, every uploads folder,
 *  the entity registry, and the active-entity pointer. Restoring from this
 *  bundle reconstitutes the whole app.
 *
 *  Layout:
 *    manifest.json                 (lists entities + bundle version)
 *    entities.json                 (raw registry file from dataRoot)
 *    active-entity                 (raw file from dataRoot, if present)
 *    <entityId>/database.sql       (pg_dump of that entity)
 *    <entityId>/uploads/...        (every persisted user file)
 *
 *  Silently skips entities whose pgdata has never been initialised — that's
 *  normal for a newly-added entity that hasn't been opened yet.
 */
export async function createFullBundle(): Promise<Buffer> {
  const entities = getEntities()
  const zip = new JSZip()
  const dataRoot = getDataRoot()
  const entityManifest: Array<{
    id: string
    name: string
    type: string
    dbDumpBytes: number
    uploadFileCount: number
    skipped: boolean
    skipReason?: string
  }> = []

  // Include the registry + active-entity pointer so a full restore can seed
  // the same entity topology the user had.
  const entitiesFile = path.join(dataRoot, "entities.json")
  if (existsSync(entitiesFile)) {
    zip.file("entities.json", await fs.readFile(entitiesFile))
  }
  const activeFile = path.join(dataRoot, "active-entity")
  if (existsSync(activeFile)) {
    zip.file("active-entity", await fs.readFile(activeFile))
  }

  for (const entity of entities) {
    try {
      const dbDump = await withEntityDb(entity, async (connStr) => runPgDump(connStr))
      zip.file(`${entity.id}/database.sql`, dbDump)

      // Uploads live under the entity's data dir regardless of whether its
      // cluster was running — read them straight off disk.
      const uploadsDir = getUserUploadsDirectory(entity.id)
      const files = await readDirRecursive(uploadsDir)
      for (const { relativePath, buffer } of files) {
        zip.file(`${entity.id}/uploads/${relativePath}`, buffer)
      }

      entityManifest.push({
        id: entity.id,
        name: entity.name,
        type: entity.type,
        dbDumpBytes: Buffer.byteLength(dbDump, "utf-8"),
        uploadFileCount: files.length,
        skipped: false,
      })
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      console.warn(`[bundle] Skipping entity "${entity.id}" in full bundle: ${reason}`)
      entityManifest.push({
        id: entity.id,
        name: entity.name,
        type: entity.type,
        dbDumpBytes: 0,
        uploadFileCount: 0,
        skipped: true,
        skipReason: reason,
      })
    }
  }

  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        version: "3.0",
        created: new Date().toISOString(),
        entities: entityManifest,
      },
      null,
      2,
    ),
  )

  const zipBuffer = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  })

  return Buffer.from(zipBuffer)
}
