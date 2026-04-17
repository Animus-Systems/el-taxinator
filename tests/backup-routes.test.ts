import Fastify from "fastify"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getOrCreateSelfHostedUser: vi.fn(),
  getActiveEntity: vi.fn(),
  createBundle: vi.fn(),
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  getAuthUrl: vi.fn(),
  getTokensFromCode: vi.fn(),
  isGoogleDriveConfigured: vi.fn(),
  uploadToGoogleDrive: vi.fn(),
  pruneOldBackups: vi.fn(),
}))

vi.mock("@/models/users", () => ({
  getOrCreateSelfHostedUser: mocks.getOrCreateSelfHostedUser,
}))

vi.mock("@/lib/entities", () => ({
  getActiveEntity: mocks.getActiveEntity,
}))

vi.mock("@/lib/bundle", () => ({
  createBundle: mocks.createBundle,
}))

vi.mock("@/models/settings", () => ({
  getSettings: mocks.getSettings,
  updateSettings: mocks.updateSettings,
}))

vi.mock("@/lib/google-drive", () => ({
  getAuthUrl: mocks.getAuthUrl,
  getTokensFromCode: mocks.getTokensFromCode,
  isGoogleDriveConfigured: mocks.isGoogleDriveConfigured,
  uploadToGoogleDrive: mocks.uploadToGoogleDrive,
  pruneOldBackups: mocks.pruneOldBackups,
}))

import { exportRoutes } from "@/server/routes/export"
import { backupRoutes } from "@/server/routes/backups"

describe("backup routes", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mocks.getOrCreateSelfHostedUser.mockResolvedValue({
      id: "user-1",
      email: "taxhacker@localhost",
    })
    mocks.getActiveEntity.mockResolvedValue({
      id: "entity-1",
      name: "Acme Canary",
      type: "autonomo",
    })
    mocks.createBundle.mockResolvedValue(Buffer.from("zip-data"))
    mocks.getSettings.mockResolvedValue({})
    mocks.updateSettings.mockResolvedValue(null)
    mocks.getAuthUrl.mockReturnValue("https://accounts.google.test/o/oauth2/auth")
    mocks.getTokensFromCode.mockResolvedValue({
      refresh_token: "refresh-token-1",
    })
    mocks.isGoogleDriveConfigured.mockImplementation((settings: Record<string, string> | undefined) => {
      return Boolean(settings?.["google_drive_client_id"] && settings?.["google_drive_client_secret"])
    })
    mocks.uploadToGoogleDrive.mockResolvedValue({
      fileId: "file-1",
      webViewLink: "https://drive.google.test/file-1",
    })
    mocks.pruneOldBackups.mockResolvedValue(2)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("serves a portable entity bundle at /api/export/bundle", async () => {
    const app = Fastify()
    await app.register(exportRoutes)

    const response = await app.inject({
      method: "GET",
      url: "/api/export/bundle",
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers["content-type"]).toContain("application/zip")
    expect(response.headers["content-disposition"]).toContain(".taxinator.zip")
    expect(response.body).toBe("zip-data")
    expect(mocks.createBundle).toHaveBeenCalledWith(
      expect.objectContaining({ id: "entity-1" }),
    )

    await app.close()
  })

  it("stores Google Drive OAuth credentials", async () => {
    const app = Fastify()
    await app.register(backupRoutes)

    const response = await app.inject({
      method: "POST",
      url: "/api/settings/google-drive",
      payload: {
        clientId: "client-id-1",
        clientSecret: "client-secret-1",
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ success: true })
    expect(mocks.updateSettings).toHaveBeenNthCalledWith(
      1,
      "user-1",
      "google_drive_client_id",
      "client-id-1",
    )
    expect(mocks.updateSettings).toHaveBeenNthCalledWith(
      2,
      "user-1",
      "google_drive_client_secret",
      "client-secret-1",
    )

    await app.close()
  })

  it("stores backup frequency and retention settings", async () => {
    const app = Fastify()
    await app.register(backupRoutes)

    const response = await app.inject({
      method: "POST",
      url: "/api/settings/backup",
      payload: {
        backupFrequency: "daily",
        backupRetention: "10",
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ success: true })
    expect(mocks.updateSettings).toHaveBeenNthCalledWith(
      1,
      "user-1",
      "backup_frequency",
      "daily",
    )
    expect(mocks.updateSettings).toHaveBeenNthCalledWith(
      2,
      "user-1",
      "backup_retention",
      "10",
    )

    await app.close()
  })

  it("redirects to Google Drive OAuth once credentials are configured", async () => {
    mocks.getSettings.mockResolvedValue({
      google_drive_client_id: "client-id-1",
      google_drive_client_secret: "client-secret-1",
    })

    const app = Fastify()
    await app.register(backupRoutes)

    const response = await app.inject({
      method: "GET",
      url: "/api/auth/google-drive",
    })

    expect(response.statusCode).toBe(302)
    expect(response.headers.location).toBe("https://accounts.google.test/o/oauth2/auth")

    await app.close()
  })

  it("stores the refresh token received from the Google Drive callback", async () => {
    mocks.getSettings.mockResolvedValue({
      google_drive_client_id: "client-id-1",
      google_drive_client_secret: "client-secret-1",
    })

    const app = Fastify()
    await app.register(backupRoutes)

    const response = await app.inject({
      method: "GET",
      url: "/api/auth/google-drive/callback?code=test-auth-code",
    })

    expect(response.statusCode).toBe(302)
    expect(response.headers.location).toBe("/settings/backups?gdrive=connected")
    expect(mocks.getTokensFromCode).toHaveBeenCalledWith(
      "test-auth-code",
      expect.objectContaining({
        google_drive_client_id: "client-id-1",
        google_drive_client_secret: "client-secret-1",
      }),
    )
    expect(mocks.updateSettings).toHaveBeenCalledWith(
      "user-1",
      "google_drive_refresh_token",
      "refresh-token-1",
    )

    await app.close()
  })

  it("creates and uploads a backup bundle from /api/cron/backup", async () => {
    mocks.getSettings.mockResolvedValue({
      google_drive_client_id: "client-id-1",
      google_drive_client_secret: "client-secret-1",
      google_drive_refresh_token: "refresh-token-1",
      backup_retention: "5",
    })

    const app = Fastify()
    await app.register(backupRoutes)

    const response = await app.inject({
      method: "GET",
      url: "/api/cron/backup",
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      results: [
        expect.objectContaining({
          success: true,
          fileId: "file-1",
          deletedOldBackups: 2,
        }),
      ],
    })
    expect(mocks.createBundle).toHaveBeenCalledWith(
      expect.objectContaining({ id: "entity-1" }),
    )
    expect(mocks.uploadToGoogleDrive).toHaveBeenCalledWith(
      "refresh-token-1",
      expect.stringContaining(".taxinator.zip"),
      Buffer.from("zip-data"),
      "application/zip",
      expect.objectContaining({
        google_drive_client_id: "client-id-1",
        google_drive_client_secret: "client-secret-1",
      }),
    )
    expect(mocks.pruneOldBackups).toHaveBeenCalledWith(
      "refresh-token-1",
      5,
      expect.objectContaining({
        google_drive_client_id: "client-id-1",
        google_drive_client_secret: "client-secret-1",
      }),
    )
    expect(mocks.updateSettings).toHaveBeenCalledWith(
      "user-1",
      "last_backup_at",
      expect.any(String),
    )

    await app.close()
  })
})
