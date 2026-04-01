"use server"

import { ActionState } from "@/lib/actions"
import { getCurrentUser } from "@/lib/auth"
import { getPool } from "@/lib/pg"
import { getUserUploadsDirectory, safePathJoin } from "@/lib/files"
import { MODEL_BACKUP, modelFromJSON } from "@/models/backups"
import fs from "fs/promises"
import JSZip from "jszip"
import path from "path"

const SUPPORTED_BACKUP_VERSIONS = ["1.0"]
const REMOVE_EXISTING_DATA = true
const MAX_BACKUP_SIZE = 256 * 1024 * 1024 // 256MB

type BackupRestoreResult = {
  counters: Record<string, number>
}

export async function restoreBackupAction(
  _prevState: ActionState<BackupRestoreResult> | null,
  formData: FormData
): Promise<ActionState<BackupRestoreResult>> {
  const pool = await getPool()
  const user = await getCurrentUser()
  const userUploadsDirectory = getUserUploadsDirectory(user)
  const file = formData.get("file") as File

  if (!file || file.size === 0) {
    return { success: false, error: "No file provided" }
  }

  if (file.size > MAX_BACKUP_SIZE) {
    return { success: false, error: `Backup file too large. Maximum size is ${MAX_BACKUP_SIZE / 1024 / 1024}MB` }
  }

  // Read zip archive
  let zip: JSZip
  try {
    const fileBuffer = await file.arrayBuffer()
    const fileData = Buffer.from(fileBuffer)
    zip = await JSZip.loadAsync(fileData)
  } catch (error) {
    return { success: false, error: "Bad zip archive: " + (error as Error).message }
  }

  // Check metadata and start restoring
  try {
    const metadataFile = zip.file("data/metadata.json")
    if (metadataFile) {
      const metadataContent = await metadataFile.async("string")
      try {
        const metadata = JSON.parse(metadataContent)
        if (!metadata.version || !SUPPORTED_BACKUP_VERSIONS.includes(metadata.version)) {
          return {
            success: false,
            error: `Incompatible backup version: ${
              metadata.version || "unknown"
            }. Supported versions: ${SUPPORTED_BACKUP_VERSIONS.join(", ")}`,
          }
        }
        console.log(`Restoring backup version ${metadata.version} created at ${metadata.timestamp}`)
      } catch (error) {
        console.warn("Could not parse backup metadata:", error)
      }
    } else {
      console.warn("No metadata found in backup, assuming legacy format")
    }

    // Remove existing data
    if (REMOVE_EXISTING_DATA) {
      await cleanupUserTables(user.id)
      await fs.rm(userUploadsDirectory, { recursive: true, force: true })
    }

    const counters: Record<string, number> = {}

    // Restore tables
    for (const backup of MODEL_BACKUP) {
      try {
        const jsonFile = zip.file(`data/${backup.filename}`)
        if (jsonFile) {
          const jsonContent = await jsonFile.async("string")
          const restoredCount = await modelFromJSON(user.id, backup, jsonContent)
          console.log(`Restored ${restoredCount} records from ${backup.filename}`)
          counters[backup.filename] = restoredCount
        }
      } catch (error) {
        console.error(`Error restoring model from ${backup.filename}:`, error)
      }
    }

    // Restore files
    try {
      let restoredFilesCount = 0
      const { rows: files } = await pool.query<{ id: string; path: string }>(
        `SELECT id, path FROM files WHERE user_id = $1`,
        [user.id]
      )

      const userUploadsDirectory = getUserUploadsDirectory(user)

      for (const file of files) {
        const filePathWithoutPrefix = path.normalize(file.path.replace(/^.*\/uploads\//, ""))
        const zipFilePath = path.join("data/uploads", filePathWithoutPrefix)
        const zipFile = zip.file(zipFilePath)
        if (!zipFile) {
          console.log(`File ${file.path} not found in backup`)
          continue
        }

        const fileContents = await zipFile.async("nodebuffer")
        const fullFilePath = safePathJoin(userUploadsDirectory, filePathWithoutPrefix)
        if (!fullFilePath.startsWith(path.normalize(userUploadsDirectory))) {
          console.error(`Attempted path traversal detected for file ${file.path}`)
          continue
        }

        try {
          await fs.mkdir(path.dirname(fullFilePath), { recursive: true })
          await fs.writeFile(fullFilePath, fileContents)
          restoredFilesCount++
        } catch (error) {
          console.error(`Error writing file ${fullFilePath}:`, error)
          continue
        }

        await pool.query(
          `UPDATE files SET path = $1 WHERE id = $2`,
          [filePathWithoutPrefix, file.id]
        )
      }
      counters["Uploaded attachments"] = restoredFilesCount
    } catch (error) {
      console.error("Error restoring uploaded files:", error)
      return {
        success: false,
        error: `Error restoring uploaded files: ${error instanceof Error ? error.message : String(error)}`,
      }
    }

    return { success: true, data: { counters } }
  } catch (error) {
    console.error("Error restoring from backup:", error)
    return {
      success: false,
      error: `Error restoring from backup: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

async function cleanupUserTables(userId: string) {
  const pool = await getPool()
  // Delete in reverse order to handle foreign key constraints
  for (const { tableName } of [...MODEL_BACKUP].reverse()) {
    try {
      await pool.query(`DELETE FROM ${tableName} WHERE user_id = $1`, [userId])
    } catch (error) {
      console.error(`Error clearing table ${tableName}:`, error)
    }
  }
}
