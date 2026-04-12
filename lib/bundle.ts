import type { Entity } from "@/lib/entities"
import { getEmbeddedConnectionString } from "@/lib/embedded-pg"
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

/**
 * Create a portable .taxinator.zip bundle for an entity.
 * Contains: manifest.json + database.sql (pg_dump) + uploads/
 */
export async function createBundle(entity: Entity): Promise<Buffer> {
  // Run pg_dump — use external DB URL if set, otherwise the embedded cluster
  const connectionString = entity.db ?? getEmbeddedConnectionString()
  const dbDump = execFileSync("pg_dump", [
    "--no-owner", "--no-privileges", "--no-comments", "--clean", "--if-exists", connectionString,
  ], { timeout: 120_000, encoding: "utf-8", maxBuffer: 500 * 1024 * 1024 })

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
