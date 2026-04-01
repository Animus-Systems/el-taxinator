import { getEntities, getPoolForEntity } from "@/lib/entities"
import { uploadToGoogleDrive, pruneOldBackups } from "@/lib/google-drive"
import { getUserUploadsDirectory, FILE_UPLOAD_PATH } from "@/lib/files"
import { mapRow } from "@/lib/sql"
import type { User, Setting } from "@/lib/db-types"
import { execFileSync } from "child_process"
import { existsSync } from "fs"
import fs from "fs/promises"
import JSZip from "jszip"
import { NextResponse } from "next/server"
import path from "path"

const MAX_FILE_SIZE = 64 * 1024 * 1024

async function readDirRecursive(dir: string, base: string = dir): Promise<{ relativePath: string; buffer: Buffer }[]> {
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
 * Cron endpoint: backs up all entities that have Google Drive configured.
 * Call via: curl http://localhost:7331/api/cron/backup
 * Or set up an external cron job / Docker healthcheck.
 */
export async function GET() {
  const entities = getEntities()
  const results: { entity: string; success: boolean; error?: string }[] = []

  for (const entity of entities) {
    try {
      const pool = getPoolForEntity(entity.id)

      // Get user and settings from this entity's database
      const userResult = await pool.query(`SELECT * FROM users LIMIT 1`)
      if (userResult.rows.length === 0) {
        results.push({ entity: entity.name, success: false, error: "No user found" })
        continue
      }
      const user = mapRow<User>(userResult.rows[0])

      const settingsResult = await pool.query(`SELECT * FROM settings WHERE user_id = $1`, [user.id])
      const settings: Record<string, string> = {}
      for (const row of settingsResult.rows) {
        const s = mapRow<Setting>(row)
        settings[s.code] = s.value ?? ""
      }

      const refreshToken = settings.google_drive_refresh_token
      if (!refreshToken) {
        results.push({ entity: entity.name, success: false, error: "Google Drive not connected" })
        continue
      }

      // Check backup frequency
      const frequency = settings.backup_frequency || "weekly"
      const lastBackup = settings.last_backup_at ? new Date(settings.last_backup_at) : null
      const now = new Date()

      if (lastBackup) {
        const hoursSinceLastBackup = (now.getTime() - lastBackup.getTime()) / (1000 * 60 * 60)
        if (frequency === "daily" && hoursSinceLastBackup < 20) {
          results.push({ entity: entity.name, success: true, error: "Skipped (too recent)" })
          continue
        }
        if (frequency === "weekly" && hoursSinceLastBackup < 144) {
          results.push({ entity: entity.name, success: true, error: "Skipped (too recent)" })
          continue
        }
      }

      // Generate the bundle
      let dbDump: string
      try {
        dbDump = execFileSync("pg_dump", [
          "--no-owner", "--no-privileges", "--no-comments", "--clean", "--if-exists", entity.db,
        ], { timeout: 120_000, encoding: "utf-8", maxBuffer: 500 * 1024 * 1024 })
      } catch {
        results.push({ entity: entity.name, success: false, error: "pg_dump failed" })
        continue
      }

      const zip = new JSZip()
      zip.file("manifest.json", JSON.stringify({
        version: "2.0",
        entity: { id: entity.id, name: entity.name, type: entity.type },
        created: now.toISOString(),
        dbDumpFile: "database.sql",
      }, null, 2))
      zip.file("database.sql", dbDump)

      const uploadsDir = path.join(FILE_UPLOAD_PATH, user.email)
      const files = await readDirRecursive(uploadsDir)
      for (const { relativePath, buffer } of files) {
        zip.file(`uploads/${relativePath}`, buffer)
      }

      const zipBuffer = Buffer.from(await zip.generateAsync({
        type: "uint8array",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      }))

      // Upload to Google Drive
      const slug = entity.name.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()
      const dateStr = now.toISOString().slice(0, 10)
      const fileName = `${slug}-${dateStr}.taxinator.zip`

      await uploadToGoogleDrive(refreshToken, fileName, zipBuffer)

      // Prune old backups
      const retention = parseInt(settings.backup_retention || "5")
      await pruneOldBackups(refreshToken, retention)

      // Save last backup timestamp
      await pool.query(
        `INSERT INTO settings (user_id, code, name, value) VALUES ($1, 'last_backup_at', 'Last Backup', $2)
         ON CONFLICT (user_id, code) DO UPDATE SET value = $2`,
        [user.id, now.toISOString()],
      )

      results.push({ entity: entity.name, success: true })
    } catch (error) {
      results.push({ entity: entity.name, success: false, error: error instanceof Error ? error.message : "Unknown error" })
    }
  }

  return NextResponse.json({ results, timestamp: new Date().toISOString() })
}
