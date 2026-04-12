import { getCurrentUser } from "@/lib/auth"
import { fileExists, getStaticDirectory, safePathJoin } from "@/lib/files"
import { getActiveEntityId } from "@/lib/entities"
import fs from "fs/promises"
import lookup from "mime-types"
import { NextResponse } from "next/server"

export async function GET(request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params
  await getCurrentUser()

  if (!filename) {
    return new NextResponse("No filename provided", { status: 400 })
  }

  const entityId = await getActiveEntityId()
  const staticFilesDirectory = getStaticDirectory(entityId)

  try {
    const fullFilePath = safePathJoin(staticFilesDirectory, filename)
    const isFileExists = await fileExists(fullFilePath)
    if (!isFileExists) {
      return new NextResponse("File not found", { status: 404 })
    }

    const fileBuffer = await fs.readFile(fullFilePath)

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": lookup.lookup(filename) || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    })
  } catch (error) {
    console.error("Error serving file:", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
