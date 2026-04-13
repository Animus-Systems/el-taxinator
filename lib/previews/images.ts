import { fileExists, getUserPreviewsDirectory, safePathJoin } from "@/lib/files"
import fs from "fs/promises"
import path from "path"
import sharp from "sharp"
import config from "../config"

export async function resizeImage(
  entityId: string,
  origFilePath: string,
  maxWidth: number = config.upload.images.maxWidth,
  maxHeight: number = config.upload.images.maxHeight,
  quality: number = config.upload.images.quality
): Promise<{ contentType: string; resizedPath: string }> {
  try {
    const userPreviewsDirectory = getUserPreviewsDirectory(entityId)
    await fs.mkdir(userPreviewsDirectory, { recursive: true })

    const basename = path.basename(origFilePath, path.extname(origFilePath))
    const outputPath = safePathJoin(userPreviewsDirectory, `${basename}.webp`)

    if (await fileExists(outputPath)) {
      const metadata = await sharp(outputPath).metadata()
      return {
        contentType: `image/${metadata.format}`,
        resizedPath: outputPath,
      }
    }

    await sharp(origFilePath)
      .rotate()
      .resize(maxWidth, maxHeight, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: quality })
      .toFile(outputPath)

    return {
      contentType: "image/webp",
      resizedPath: outputPath,
    }
  } catch (error) {
    console.error("Error resizing image:", error)
    return {
      contentType: "image/unknown",
      resizedPath: origFilePath,
    }
  }
}
