import { resizeImage } from "@/lib/previews/images"
import { pdfToImages } from "@/lib/previews/pdf"

export async function generateFilePreviews(
  entityId: string,
  filePath: string,
  mimetype: string
): Promise<{ contentType: string; previews: string[] }> {
  if (mimetype === "application/pdf") {
    const { contentType, pages } = await pdfToImages(entityId, filePath)
    return { contentType, previews: pages }
  } else if (mimetype.startsWith("image/")) {
    const { contentType, resizedPath } = await resizeImage(entityId, filePath)
    return { contentType, previews: [resizedPath] }
  } else {
    return { contentType: mimetype, previews: [filePath] }
  }
}
