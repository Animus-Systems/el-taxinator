/**
 * Fastify routes for the Contacts AI-import flow.
 *
 * POST /api/contacts/extract
 *   Accepts a single PDF / CSV / XLSX / image multipart upload. Runs the
 *   LLM to pull out a list of contact records and returns them to the
 *   client WITHOUT saving anything — the /contacts page shows a review
 *   table and the user ticks which ones to commit. Committing goes via
 *   `trpc.contacts.bulkCreate`.
 */
import type { FastifyInstance } from "fastify"
import multipart from "@fastify/multipart"

import { getOrCreateSelfHostedUser } from "@/models/users"
import { extractContactsFromFile } from "@/ai/extract-contacts"
import type { ExtractedContact } from "@/ai/extract-contacts"

type UploadedPart = {
  filename: string
  mimetype: string
  buffer: Buffer
}

async function parseContactImportMultipart(request: unknown): Promise<UploadedPart | null> {
  const parts = (request as {
    parts(): AsyncIterableIterator<import("@fastify/multipart").Multipart>
  }).parts()
  for await (const part of parts) {
    if (part.type !== "file") continue
    const buffer = await part.toBuffer()
    return {
      filename: part.filename,
      mimetype: part.mimetype || "application/octet-stream",
      buffer,
    }
  }
  return null
}

export async function contactsRoutes(app: FastifyInstance) {
  if (!app.hasContentTypeParser("multipart/form-data")) {
    await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024, files: 1 } })
  }

  app.post("/api/contacts/extract", async (request, reply) => {
    try {
      const user = await getOrCreateSelfHostedUser()
      if (!user) return reply.code(401).send({ success: false, error: "Not authenticated" })

      const part = await parseContactImportMultipart(request)
      if (!part) {
        return reply.code(400).send({ success: false, error: "A file is required" })
      }

      let contacts: ExtractedContact[]
      try {
        contacts = await extractContactsFromFile(user.id, part)
      } catch (err) {
        console.error("[contacts/extract] extraction failed:", err)
        return reply.code(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Extraction failed",
        })
      }

      return reply.send({
        success: true,
        filename: part.filename,
        contacts,
      })
    } catch (error) {
      console.error("[contacts/extract] Error:", error)
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : "Upload failed",
      })
    }
  })
}
