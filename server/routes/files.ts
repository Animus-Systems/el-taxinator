/**
 * Fastify routes for file uploads, previews, and downloads.
 *
 * All three routes land here so the SPA's `<a href="/files/download/:id">`,
 * `<img src="/files/preview/:id">`, and legacy `uploadFilesAction` keep
 * working after the Next.js → Vite migration.
 */
import type { FastifyInstance } from "fastify"
import multipart from "@fastify/multipart"
import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import path from "node:path"

import { getOrCreateSelfHostedUser } from "@/models/users"
import { getFileById, persistUploadedFile } from "@/models/files"
import { fullPathForFile, getUserPreviewsDirectory, previewFilePath, safePathJoin } from "@/lib/files"
import { getActiveEntityId } from "@/lib/entities"

export async function filesRoutes(app: FastifyInstance) {
  // @fastify/multipart is registered by importRoutes too — calling register
  // twice is safe; the plugin short-circuits if already present.
  if (!app.hasContentTypeParser("multipart/form-data")) {
    await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } })
  }

  // ─── Upload (legacy drop-zone + upload buttons) ──────────────────────
  app.post("/api/files/upload", async (request, reply) => {
    try {
      const user = await getOrCreateSelfHostedUser()
      if (!user) return reply.code(401).send({ success: false, error: "Not authenticated" })

      const entityId = await getActiveEntityId()
      const created: { id: string; filename: string }[] = []

      for await (const part of (request as unknown as { parts(): AsyncIterableIterator<import("@fastify/multipart").Multipart> }).parts()) {
        if (part.type !== "file") continue
        const buffer = await part.toBuffer()
        const file = await persistUploadedFile(user.id, entityId, {
          fileName: part.filename,
          mimetype: part.mimetype,
          buffer,
          isReviewed: false,
        })
        created.push({ id: file.id, filename: file.filename })
      }

      if (created.length === 0) {
        return reply.code(400).send({ success: false, error: "No files uploaded" })
      }
      return reply.send({ success: true, files: created })
    } catch (error) {
      console.error("[files/upload] Error:", error)
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : "Upload failed",
      })
    }
  })

  // ─── Download (stream original bytes) ────────────────────────────────
  app.get<{ Params: { id: string } }>("/files/download/:id", async (request, reply) => {
    try {
      const user = await getOrCreateSelfHostedUser()
      if (!user) return reply.code(401).send({ error: "Not authenticated" })

      const file = await getFileById(request.params.id, user.id)
      if (!file) return reply.code(404).send({ error: "File not found" })

      const entityId = await getActiveEntityId()
      const abs = fullPathForFile(entityId, file)
      const stats = await stat(abs).catch(() => null)
      if (!stats) return reply.code(404).send({ error: "File bytes missing on disk" })

      const safeFilename = file.filename.replace(/["\\]/g, "_")
      reply.header("Content-Type", file.mimetype || "application/octet-stream")
      reply.header("Content-Length", String(stats.size))
      reply.header("Content-Disposition", `attachment; filename="${safeFilename}"`)
      return reply.send(createReadStream(abs))
    } catch (error) {
      console.error("[files/download] Error:", error)
      return reply.code(500).send({
        error: error instanceof Error ? error.message : "Download failed",
      })
    }
  })

  // ─── Preview (webp if generated, else the original for images) ───────
  app.get<{ Params: { id: string } }>("/files/preview/:id", async (request, reply) => {
    try {
      const user = await getOrCreateSelfHostedUser()
      if (!user) return reply.code(401).send({ error: "Not authenticated" })

      const file = await getFileById(request.params.id, user.id)
      if (!file) return reply.code(404).send({ error: "File not found" })

      const entityId = await getActiveEntityId()

      const previewAbs = safePathJoin(getUserPreviewsDirectory(entityId), path.basename(previewFilePath(file.id, 1)))
      const previewStats = await stat(previewAbs).catch(() => null)
      if (previewStats) {
        reply.header("Content-Type", "image/webp")
        reply.header("Content-Length", String(previewStats.size))
        return reply.send(createReadStream(previewAbs))
      }

      // No generated preview — fall back to the original file for images.
      if (file.mimetype.startsWith("image/")) {
        const abs = fullPathForFile(entityId, file)
        const stats = await stat(abs).catch(() => null)
        if (!stats) return reply.code(404).send({ error: "File bytes missing on disk" })
        reply.header("Content-Type", file.mimetype)
        reply.header("Content-Length", String(stats.size))
        return reply.send(createReadStream(abs))
      }

      return reply.code(404).send({ error: "Preview not available" })
    } catch (error) {
      console.error("[files/preview] Error:", error)
      return reply.code(500).send({
        error: error instanceof Error ? error.message : "Preview failed",
      })
    }
  })
}
