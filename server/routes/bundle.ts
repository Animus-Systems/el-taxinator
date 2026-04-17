import type { FastifyInstance } from "fastify"
import multipart from "@fastify/multipart"

import { importBundleFromBuffer, readBundleManifest } from "@/lib/bundle-import"

async function parseMultipart(
  request: { parts(): AsyncIterableIterator<import("@fastify/multipart").Multipart> },
) {
  const fields: Record<string, string> = {}
  let fileBuffer: Buffer | null = null

  for await (const part of request.parts()) {
    if (part.type === "file") {
      fileBuffer = await part.toBuffer()
    } else {
      fields[part.fieldname] = String(part.value ?? "")
    }
  }

  return { fields, fileBuffer }
}

export async function bundleRoutes(app: FastifyInstance) {
  if (!app.hasContentTypeParser("multipart/form-data")) {
    await app.register(multipart, { limits: { fileSize: 512 * 1024 * 1024 } })
  }

  app.post("/api/bundle/manifest", async (request, reply) => {
    try {
      const { fileBuffer } = await parseMultipart(request as never)
      if (!fileBuffer) {
        return reply.code(400).send({ success: false, error: "Bundle file is required" })
      }

      const manifest = await readBundleManifest(fileBuffer)
      return reply.send({ success: true, manifest })
    } catch (error) {
      return reply.code(400).send({
        success: false,
        error: error instanceof Error ? error.message : "Invalid bundle",
      })
    }
  })

  app.post("/api/bundle/import", async (request, reply) => {
    try {
      const { fields, fileBuffer } = await parseMultipart(request as never)
      if (!fileBuffer) {
        return reply.code(400).send({ success: false, error: "Bundle file is required" })
      }

      const result = await importBundleFromBuffer(fileBuffer, {
        entityName: fields["entityName"],
        entityType: fields["entityType"],
      })

      return reply.send({
        success: true,
        entityId: result.entityId,
      })
    } catch (error) {
      return reply.code(400).send({
        success: false,
        error: error instanceof Error ? error.message : "Import failed",
      })
    }
  })
}
