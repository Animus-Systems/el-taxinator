"use server"

import {
  addEntity,
  getEntities,
  getPoolForEntity,
  setActiveEntity,
  testDatabaseConnection,
  type Entity,
} from "@/lib/entities"
import { ensureSchema } from "@/lib/schema"
import { getOrCreateSelfHostedUser } from "@/models/users"
import { FILE_UPLOAD_PATH } from "@/lib/files"
import { execFileSync } from "child_process"
import { mkdir, writeFile } from "fs/promises"
import JSZip from "jszip"
import path from "path"
import { redirect } from "next/navigation"

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
 * Import a .taxinator.zip bundle into a database.
 */
export async function importBundleAction(formData: FormData) {
  const file = formData.get("bundle") as File | null
  const connectionString = formData.get("connectionString") as string
  const entityName = formData.get("entityName") as string
  const entityType = formData.get("entityType") as string

  if (!file || !connectionString) {
    return { success: false, error: "Bundle file and database connection are required" }
  }

  // Test connection
  const test = await testDatabaseConnection(connectionString)
  if (!test.ok) {
    return { success: false, error: `Cannot connect to database: ${test.error}` }
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

    // Restore the database using psql
    try {
      execFileSync("psql", [connectionString], {
        input: dbDump,
        timeout: 120_000,
        maxBuffer: 500 * 1024 * 1024,
        stdio: ["pipe", "pipe", "pipe"],
      })
    } catch (error) {
      // psql may output warnings for --clean --if-exists on fresh DBs — that's OK
      const stderr = error instanceof Error ? (error as any).stderr?.toString() : ""
      if (stderr && !stderr.includes("ERROR")) {
        // Just warnings, continue
      } else {
        console.error("psql restore error:", stderr)
        return { success: false, error: "Failed to restore database. Is psql installed?" }
      }
    }

    // Ensure schema defaults are applied
    const entityId = manifest.entity.id
    const name = entityName || manifest.entity.name
    const type = (entityType || manifest.entity.type) as Entity["type"]

    // Add entity to config first so getPool can find it
    const existing = getEntities()
    if (!existing.some(e => e.id === entityId)) {
      addEntity({ id: entityId, name, type, db: connectionString })
    }

    const pool = getPoolForEntity(entityId)
    await ensureSchema(pool)

    // Extract uploaded files
    const user = await getOrCreateSelfHostedUser()
    const userUploadsDir = path.join(FILE_UPLOAD_PATH, user.email)

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
