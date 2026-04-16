import { google } from "googleapis"

const SCOPES = ["https://www.googleapis.com/auth/drive.file"]
const FOLDER_NAME = "Taxinator Backups"

/**
 * Create OAuth2 client. Reads credentials from provided params, env vars, or throws.
 */
function getOAuth2Client(clientId?: string, clientSecret?: string) {
  const id = clientId || process.env["GOOGLE_DRIVE_CLIENT_ID"]
  const secret = clientSecret || process.env["GOOGLE_DRIVE_CLIENT_SECRET"]
  const redirectUri = `${process.env["BASE_URL"] || "http://localhost:7331"}/api/auth/google-drive/callback`

  if (!id || !secret) {
    throw new Error("Google Drive credentials not configured")
  }

  return new google.auth.OAuth2(id, secret, redirectUri)
}

/**
 * Check if Google Drive credentials are available (from env or settings).
 */
export function isGoogleDriveConfigured(settings?: Record<string, string>): boolean {
  const fromEnv = !!(process.env["GOOGLE_DRIVE_CLIENT_ID"] && process.env["GOOGLE_DRIVE_CLIENT_SECRET"])
  const fromSettings = !!(settings?.["google_drive_client_id"] && settings?.["google_drive_client_secret"])
  return fromEnv || fromSettings
}

/**
 * Get the Google OAuth2 authorization URL for Drive access.
 */
export function getAuthUrl(settings?: Record<string, string>): string {
  const oauth2Client = getOAuth2Client(settings?.["google_drive_client_id"], settings?.["google_drive_client_secret"])
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  })
}

/**
 * Exchange an authorization code for tokens.
 */
export async function getTokensFromCode(code: string, settings?: Record<string, string>) {
  const oauth2Client = getOAuth2Client(settings?.["google_drive_client_id"], settings?.["google_drive_client_secret"])
  const { tokens } = await oauth2Client.getToken(code)
  return tokens
}

/**
 * Create an authenticated Drive client from a refresh token.
 */
function getDriveClient(refreshToken: string) {
  const oauth2Client = getOAuth2Client()
  oauth2Client.setCredentials({ refresh_token: refreshToken })
  return google.drive({ version: "v3", auth: oauth2Client })
}

/**
 * Get or create the Taxinator Backups folder in Google Drive.
 */
async function getOrCreateFolder(refreshToken: string): Promise<string> {
  const drive = getDriveClient(refreshToken)

  // Check if folder already exists
  const existing = await drive.files.list({
    q: `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id, name)",
    spaces: "drive",
  })

  const firstExisting = existing.data.files?.[0]
  if (firstExisting?.id) {
    return firstExisting.id
  }

  // Create the folder
  const folder = await drive.files.create({
    requestBody: {
      name: FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id",
  })

  return folder.data.id!
}

/**
 * Upload a file to Google Drive.
 */
export async function uploadToGoogleDrive(
  refreshToken: string,
  fileName: string,
  content: Buffer,
  mimeType: string = "application/zip",
): Promise<{ fileId: string; webViewLink?: string }> {
  const drive = getDriveClient(refreshToken)
  const folderId = await getOrCreateFolder(refreshToken)

  const { Readable } = await import("stream")
  const stream = new Readable()
  stream.push(content)
  stream.push(null)

  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: stream,
    },
    fields: "id, webViewLink",
  })

  const fileId = response.data.id
  if (!fileId) {
    throw new Error("Google Drive upload did not return a file id")
  }

  const webViewLink = response.data.webViewLink ?? undefined
  return webViewLink === undefined
    ? { fileId }
    : { fileId, webViewLink }
}

/**
 * List backup files in the Taxinator Backups folder.
 */
export async function listBackups(refreshToken: string): Promise<{
  id: string
  name: string
  size: string
  createdTime: string
}[]> {
  const drive = getDriveClient(refreshToken)
  const folderId = await getOrCreateFolder(refreshToken)

  const response = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false and name contains '.taxinator.zip'`,
    fields: "files(id, name, size, createdTime)",
    orderBy: "createdTime desc",
    pageSize: 50,
  })

  return (response.data.files ?? [])
    .filter((f): f is typeof f & { id: string; name: string; createdTime: string } =>
      typeof f.id === "string" && typeof f.name === "string" && typeof f.createdTime === "string",
    )
    .map((f) => ({
      id: f.id,
      name: f.name,
      size: f.size ?? "0",
      createdTime: f.createdTime,
    }))
}

/**
 * Download a file from Google Drive.
 */
export async function downloadFromGoogleDrive(
  refreshToken: string,
  fileId: string,
): Promise<Buffer> {
  const drive = getDriveClient(refreshToken)

  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" },
  )

  return Buffer.from(response.data as ArrayBuffer)
}

/**
 * Delete a file from Google Drive.
 */
export async function deleteFromGoogleDrive(
  refreshToken: string,
  fileId: string,
): Promise<void> {
  const drive = getDriveClient(refreshToken)
  await drive.files.delete({ fileId })
}

/**
 * Delete old backups beyond the retention limit.
 */
export async function pruneOldBackups(
  refreshToken: string,
  maxBackups: number = 5,
): Promise<number> {
  const backups = await listBackups(refreshToken)
  let deleted = 0

  if (backups.length > maxBackups) {
    const toDelete = backups.slice(maxBackups)
    for (const backup of toDelete) {
      await deleteFromGoogleDrive(refreshToken, backup.id)
      deleted++
    }
  }

  return deleted
}
