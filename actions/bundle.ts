"use server"

import {
  addEntity,
  getEntities,
  getPoolForEntity,
  setActiveEntity,
  type Entity,
  type EntityType,
} from "@/lib/entities"
import { ensureSchema } from "@/lib/schema"
import { getOrCreateSelfHostedUser } from "@/models/users"
import { getUserUploadsDirectory } from "@/lib/files"
import { getEntityById } from "@/lib/entities"
import { execFileSync } from "child_process"
import { mkdir, writeFile } from "fs/promises"
import JSZip from "jszip"
import path from "path"
import { codeFromName } from "@/lib/utils"

type BundleManifest = {
  version: string
  entity: { id: string; name: string; type: string }
  created: string
  dbDumpFile: string
}

/**
 * Read and validate a .taxinator.zip bundle manifest without importing.
 */
export async function readBundleManifestAction(formData: FormData) {
  const file = formData.get("bundle") as File | null
  if (!file) return { success: false, error: "No file provided" }

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const zip = await JSZip.loadAsync(buffer)

    const manifestFile = zip.file("manifest.json")
    if (!manifestFile) {
      return { success: false, error: "Invalid bundle: missing manifest.json" }
    }

    const manifest: BundleManifest = JSON.parse(await manifestFile.async("string"))
    if (!manifest.version || !manifest.entity || !manifest.dbDumpFile) {
      return { success: false, error: "Invalid bundle: incomplete manifest" }
    }

    const dbDumpFile = zip.file(manifest.dbDumpFile)
    if (!dbDumpFile) {
      return { success: false, error: `Invalid bundle: missing ${manifest.dbDumpFile}` }
    }

    const uploadCount = Object.keys(zip.files).filter(f => f.startsWith("uploads/") && !zip.files[f].dir).length

    return {
      success: true,
      manifest,
      stats: {
        uploadedFiles: uploadCount,
        bundleSize: buffer.length,
      },
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to read bundle" }
  }
}

/**
 * Import a .taxinator.zip bundle into a new entity backed by the embedded
 * cluster. Creates the entity, restores the database dump via psql, and
 * extracts uploads into the entity's data directory.
 */
export async function importBundleAction(formData: FormData) {
  const file = formData.get("bundle") as File | null
  const entityName = (formData.get("entityName") as string) || ""
  const entityType = (formData.get("entityType") as string) || "autonomo"

  if (!file) {
    return { success: false, error: "Bundle file is required" }
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const zip = await JSZip.loadAsync(buffer)

    const manifestFile = zip.file("manifest.json")
    if (!manifestFile) return { success: false, error: "Invalid bundle" }
    const manifest: BundleManifest = JSON.parse(await manifestFile.async("string"))

    // Get the database dump
    const dbDumpFile = zip.file(manifest.dbDumpFile)
    if (!dbDumpFile) return { success: false, error: "Missing database dump in bundle" }
    const dbDump = await dbDumpFile.async("string")

    // Resolve final entity metadata. The user may override the imported name
    // (e.g. when restoring "Acme SL" alongside an existing "Acme SL").
    const finalName = entityName || manifest.entity.name
    const finalType = (entityType || manifest.entity.type) as EntityType
    const entityId = codeFromName(finalName) || manifest.entity.id

    // Check for collisions
    if (getEntities().some((e) => e.id === entityId)) {
      return { success: false, error: `An entity named "${finalName}" already exists. Pick a different name.` }
    }

    // Add the entity (no db field → uses embedded cluster). The first call
    // to getPoolForEntity below will trigger the per-entity database creation.
    addEntity({ id: entityId, name: finalName, type: finalType })

    // Get a pool to force database creation, then build the connection string
    // for psql by reading it back out of the pool config.
    const pool = await getPoolForEntity(entityId)
    const connectionString = (pool.options as { connectionString?: string }).connectionString
    if (!connectionString) {
      return { success: false, error: "Failed to resolve connection string for embedded cluster" }
    }

    // Restore the database using psql. The bundled embedded-postgres binaries
    // ship psql alongside the postgres binary; if it's on PATH we use it,
    // otherwise we fall back to the system psql.
    try {
      execFileSync("psql", [connectionString], {
        input: dbDump,
        timeout: 120_000,
        maxBuffer: 500 * 1024 * 1024,
        stdio: ["pipe", "pipe", "pipe"],
      })
    } catch (error) {
      const stderr = error instanceof Error ? (error as NodeJS.ErrnoException & { stderr?: Buffer }).stderr?.toString() : ""
      // psql may emit warnings for --clean --if-exists on a fresh DB; only
      // surface the error if stderr actually contains "ERROR".
      if (stderr && stderr.includes("ERROR")) {
        console.error("psql restore error:", stderr)
        return { success: false, error: "Failed to restore database. Is psql installed and on PATH?" }
      }
    }

    // Make sure the schema is in place (idempotent — no-op if dump created tables)
    await ensureSchema(pool)

    // Extract uploaded files
    const user = await getOrCreateSelfHostedUser()
    const entity = getEntityById(entityId)
    const userUploadsDir = getUserUploadsDirectory(user, entity)

    const uploadFiles = Object.keys(zip.files).filter(
      f => f.startsWith("uploads/") && !zip.files[f].dir,
    )

    for (const filePath of uploadFiles) {
      const relativePath = filePath.replace("uploads/", "")
      const fullPath = path.join(userUploadsDir, relativePath)

      // Prevent path traversal
      if (!fullPath.startsWith(userUploadsDir)) continue

      await mkdir(path.dirname(fullPath), { recursive: true })
      const content = await zip.files[filePath].async("uint8array")
      await writeFile(fullPath, Buffer.from(content))
    }

    await setActiveEntity(entityId)

    return { success: true, entityId }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Import failed" }
  }
}
