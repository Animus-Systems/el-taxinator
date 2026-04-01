import { getCurrentUser } from "@/lib/auth"
import { getActiveEntity } from "@/lib/entities"
import { getUserUploadsDirectory } from "@/lib/files"
import { execFileSync } from "child_process"
import fs from "fs/promises"
import { existsSync } from "fs"
import JSZip from "jszip"
import { NextResponse } from "next/server"
import path from "path"

const MAX_FILE_SIZE = 64 * 1024 * 1024 // 64MB per file

/**
 * Recursively read all files in a directory, returning relative paths and buffers.
 */
async function readDirRecursive(
  dir: string,
  base: string = dir,
): Promise<{ relativePath: string; buffer: Buffer }[]> {
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
        const buffer = await fs.readFile(fullPath)
        const relativePath = path.relative(base, fullPath)
        results.push({ relativePath, buffer })
      }
    }
  }

  return results
}

export async function GET() {
  const user = await getCurrentUser()
  const entity = await getActiveEntity()

  // Run pg_dump to get a full database dump
  let dbDump: string
  try {
    dbDump = execFileSync("pg_dump", [
      "--no-owner",
      "--no-privileges",
      "--no-comments",
      "--clean",
      "--if-exists",
      entity.db,
    ], {
      timeout: 120_000,
      encoding: "utf-8",
      maxBuffer: 500 * 1024 * 1024, // 500MB
    })
  } catch (error) {
    console.error("pg_dump failed:", error)
    return NextResponse.json(
      { error: "Failed to create database dump. Is pg_dump installed?" },
      { status: 500 },
    )
  }

  // Build the ZIP
  const zip = new JSZip()

  // Manifest
  zip.file("manifest.json", JSON.stringify({
    version: "2.0",
    entity: {
      id: entity.id,
      name: entity.name,
      type: entity.type,
    },
    created: new Date().toISOString(),
    dbDumpFile: "database.sql",
  }, null, 2))

  // Database dump
  zip.file("database.sql", dbDump)

  // User uploads
  const uploadsDir = getUserUploadsDirectory(user)
  const files = await readDirRecursive(uploadsDir)
  for (const { relativePath, buffer } of files) {
    zip.file(`uploads/${relativePath}`, buffer)
  }

  // Generate ZIP
  const zipBuffer = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  })

  const slug = entity.name.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()
  const filename = `${slug}.taxinator.zip`

  return new NextResponse(Buffer.from(zipBuffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(zipBuffer.length),
    },
  })
}
