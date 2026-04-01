import { getEntities, getPoolForEntity } from "@/lib/entities"
import { uploadToGoogleDrive, pruneOldBackups } from "@/lib/google-drive"
import { createBundle } from "@/lib/bundle"
import { mapRow } from "@/lib/sql"
import type { User, Setting } from "@/lib/db-types"
import { NextRequest, NextResponse } from "next/server"

/**
 * Cron endpoint: backs up all entities that have Google Drive configured.
 * Requires CRON_SECRET env var: GET /api/cron/backup?token=YOUR_SECRET
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")
  const secret = process.env.CRON_SECRET
  if (secret && token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const entities = getEntities()

  async function backupEntity(entity: typeof entities[number]): Promise<{ entity: string; success: boolean; error?: string }> {
    const pool = getPoolForEntity(entity.id)

    const userResult = await pool.query(`SELECT * FROM users LIMIT 1`)
    if (userResult.rows.length === 0) {
      return { entity: entity.name, success: false, error: "No user found" }
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
      return { entity: entity.name, success: false, error: "Google Drive not connected" }
    }

    const frequency = settings.backup_frequency || "weekly"
    const lastBackup = settings.last_backup_at ? new Date(settings.last_backup_at) : null
    const now = new Date()

    if (lastBackup) {
      const hoursSince = (now.getTime() - lastBackup.getTime()) / (1000 * 60 * 60)
      if (frequency === "daily" && hoursSince < 20) {
        return { entity: entity.name, success: true, error: "Skipped (too recent)" }
      }
      if (frequency === "weekly" && hoursSince < 144) {
        return { entity: entity.name, success: true, error: "Skipped (too recent)" }
      }
    }

    const zipBuffer = await createBundle(entity, user)

    const slug = entity.name.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()
    const fileName = `${slug}-${now.toISOString().slice(0, 10)}.taxinator.zip`

    await uploadToGoogleDrive(refreshToken, fileName, zipBuffer)

    const retention = parseInt(settings.backup_retention || "5")
    await pruneOldBackups(refreshToken, retention)

    await pool.query(
      `INSERT INTO settings (user_id, code, name, value) VALUES ($1, 'last_backup_at', 'Last Backup', $2)
       ON CONFLICT (user_id, code) DO UPDATE SET value = $2`,
      [user.id, now.toISOString()],
    )

    return { entity: entity.name, success: true }
  }

  const settled = await Promise.allSettled(entities.map(backupEntity))
  const results = settled.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { entity: entities[i].name, success: false, error: r.reason instanceof Error ? r.reason.message : "Unknown error" },
  )

  return NextResponse.json({ results, timestamp: new Date().toISOString() })
}
