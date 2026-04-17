import type { FastifyInstance } from "fastify"

import { createBundle } from "@/lib/bundle"
import { getActiveEntity } from "@/lib/entities"
import {
  getAuthUrl,
  getTokensFromCode,
  isGoogleDriveConfigured,
  pruneOldBackups,
  uploadToGoogleDrive,
} from "@/lib/google-drive"
import { getSettings, updateSettings } from "@/models/settings"
import { getOrCreateSelfHostedUser } from "@/models/users"

function backupFileName(entityName: string): string {
  const safeEntityName = entityName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  const date = new Date().toISOString().slice(0, 10)
  return `${safeEntityName || "backup"}-${date}.taxinator.zip`
}

async function getUser() {
  return getOrCreateSelfHostedUser()
}

export async function backupRoutes(app: FastifyInstance) {
  app.post("/api/settings/google-drive", async (request, reply) => {
    const user = await getUser()
    if (!user) return reply.code(401).send({ success: false, error: "Not authenticated" })

    const body = (request.body ?? {}) as {
      clientId?: string
      clientSecret?: string
    }

    const clientId = body.clientId?.trim() ?? ""
    const clientSecret = body.clientSecret?.trim() ?? ""
    if (!clientId || !clientSecret) {
      return reply.code(400).send({
        success: false,
        error: "Google Drive client ID and client secret are required",
      })
    }

    await updateSettings(user.id, "google_drive_client_id", clientId)
    await updateSettings(user.id, "google_drive_client_secret", clientSecret)

    return reply.send({ success: true })
  })

  app.post("/api/settings/backup", async (request, reply) => {
    const user = await getUser()
    if (!user) return reply.code(401).send({ success: false, error: "Not authenticated" })

    const body = (request.body ?? {}) as {
      backupFrequency?: string
      backupRetention?: string
    }

    const frequency = body.backupFrequency?.trim() ?? ""
    const retention = body.backupRetention?.trim() ?? ""

    const allowedFrequencies = new Set(["daily", "weekly", "manual"])
    if (!allowedFrequencies.has(frequency)) {
      return reply.code(400).send({ success: false, error: "Invalid backup frequency" })
    }

    if (!/^\d+$/.test(retention)) {
      return reply.code(400).send({ success: false, error: "Invalid backup retention" })
    }

    await updateSettings(user.id, "backup_frequency", frequency)
    await updateSettings(user.id, "backup_retention", retention)

    return reply.send({ success: true })
  })

  app.get("/api/auth/google-drive", async (_request, reply) => {
    const user = await getUser()
    if (!user) return reply.code(401).send({ success: false, error: "Not authenticated" })

    const settings = await getSettings(user.id)
    if (!isGoogleDriveConfigured(settings)) {
      return reply.redirect("/settings/backups?error=missing_credentials")
    }

    return reply.redirect(getAuthUrl(settings))
  })

  app.get("/api/auth/google-drive/callback", async (request, reply) => {
    const user = await getUser()
    if (!user) return reply.code(401).send({ success: false, error: "Not authenticated" })

    const query = (request.query ?? {}) as { code?: string }
    const code = query.code?.trim()
    if (!code) {
      return reply.redirect("/settings/backups?error=missing_code")
    }

    try {
      const settings = await getSettings(user.id)
      const tokens = await getTokensFromCode(code, settings)
      const refreshToken = tokens.refresh_token?.trim()

      if (!refreshToken) {
        return reply.redirect("/settings/backups?error=missing_refresh_token")
      }

      await updateSettings(user.id, "google_drive_refresh_token", refreshToken)
      return reply.redirect("/settings/backups?gdrive=connected")
    } catch (error) {
      const message = error instanceof Error ? error.message : "oauth_failed"
      return reply.redirect(`/settings/backups?error=${encodeURIComponent(message)}`)
    }
  })

  app.get("/api/cron/backup", async (_request, reply) => {
    const user = await getUser()
    if (!user) return reply.code(401).send({ results: [{ success: false, error: "Not authenticated" }] })

    try {
      const settings = await getSettings(user.id)
      if (!isGoogleDriveConfigured(settings)) {
        return reply.send({ results: [{ success: false, error: "Google Drive credentials are not configured" }] })
      }

      const refreshToken = settings["google_drive_refresh_token"]?.trim()
      if (!refreshToken) {
        return reply.send({ results: [{ success: false, error: "Google Drive is not connected" }] })
      }

      const entity = await getActiveEntity()
      const bundle = await createBundle(entity)
      const fileName = backupFileName(entity.name)
      const upload = await uploadToGoogleDrive(
        refreshToken,
        fileName,
        bundle,
        "application/zip",
        settings,
      )
      const retention = Number.parseInt(settings["backup_retention"] ?? "5", 10)
      const deletedOldBackups = await pruneOldBackups(
        refreshToken,
        Number.isFinite(retention) ? retention : 5,
        settings,
      )
      const lastBackupAt = new Date().toISOString()
      await updateSettings(user.id, "last_backup_at", lastBackupAt)

      return reply.send({
        results: [{
          success: true,
          fileId: upload.fileId,
          ...(upload.webViewLink ? { webViewLink: upload.webViewLink } : {}),
          deletedOldBackups,
          lastBackupAt,
        }],
      })
    } catch (error) {
      return reply.send({
        results: [{
          success: false,
          error: error instanceof Error ? error.message : "Backup failed",
        }],
      })
    }
  })
}
