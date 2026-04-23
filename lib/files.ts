import type { File, Transaction, User } from "@/lib/db-types"
import { resolveEntityDir } from "@/lib/entities"
import { access, constants, readdir, stat } from "fs/promises"
import path from "path"
import config from "./config"

export const FILE_UNSORTED_DIRECTORY_NAME = "unsorted"
export const FILE_PREVIEWS_DIRECTORY_NAME = "previews"
export const FILE_STATIC_DIRECTORY_NAME = "static"
export const FILE_IMPORT_CSV_DIRECTORY_NAME = "csv"

/**
 * Get uploads directory for an entity.
 * Uses entity.dataDir if set, otherwise falls back to `data/<entityId>/uploads/`.
 */
export function getUserUploadsDirectory(entityId: string): string {
  return path.join(resolveEntityDir(entityId), "uploads")
}

export function getStaticDirectory(entityId: string): string {
  return safePathJoin(getUserUploadsDirectory(entityId), FILE_STATIC_DIRECTORY_NAME)
}

export function getUserPreviewsDirectory(entityId: string): string {
  return safePathJoin(getUserUploadsDirectory(entityId), FILE_PREVIEWS_DIRECTORY_NAME)
}

export function unsortedFilePath(fileUuid: string, filename: string) {
  const fileExtension = path.extname(filename)
  return safePathJoin(FILE_UNSORTED_DIRECTORY_NAME, `${fileUuid}${fileExtension}`)
}

export function previewFilePath(fileUuid: string, page: number) {
  return safePathJoin(FILE_PREVIEWS_DIRECTORY_NAME, `${fileUuid}.${page}.webp`)
}

export function getTransactionFileUploadPath(fileUuid: string, filename: string, transaction: Transaction) {
  const fileExtension = path.extname(filename)
  const storedFileName = `${fileUuid}${fileExtension}`
  return formatFilePath(storedFileName, transaction.issuedAt || new Date())
}

export function fullPathForFile(entityId: string, file: File): string {
  const uploadsDirectory = getUserUploadsDirectory(entityId)
  return safePathJoin(uploadsDirectory, file.path)
}

function formatFilePath(filename: string, date: Date, format = "{YYYY}/{MM}/{name}{ext}") {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const ext = path.extname(filename)
  const name = path.basename(filename, ext)

  return format.replace("{YYYY}", String(year)).replace("{MM}", month).replace("{name}", name).replace("{ext}", ext)
}

export function safePathJoin(basePath: string, ...paths: string[]) {
  const joinedPath = path.join(basePath, path.normalize(path.join(...paths)))
  if (!joinedPath.startsWith(basePath)) {
    throw new Error("Path traversal detected")
  }
  return joinedPath
}

export function contentDispositionHeader(
  disposition: "attachment" | "inline",
  filename: string,
): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_")
  const utf8 = encodeURIComponent(filename)
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${utf8}`
}

export async function fileExists(filePath: string) {
  try {
    await access(path.normalize(filePath), constants.F_OK)
    return true
  } catch {
    return false
  }
}

export async function getDirectorySize(directoryPath: string) {
  let totalSize = 0
  async function calculateSize(dir: string) {
    const files = await readdir(dir, { withFileTypes: true })
    for (const file of files) {
      const fullPath = path.join(dir, file.name)
      if (file.isDirectory()) {
        await calculateSize(fullPath)
      } else if (file.isFile()) {
        const stats = await stat(fullPath)
        totalSize += stats.size
      }
    }
  }
  await calculateSize(directoryPath)
  return totalSize
}

export function isEnoughStorageToUploadFile(user: User, fileSize: number) {
  if (config.selfHosted.isEnabled || user.storageLimit < 0) {
    return true
  }
  return user.storageUsed + fileSize <= user.storageLimit
}
