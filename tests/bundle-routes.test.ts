import Fastify from "fastify"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  importBundleFromBuffer: vi.fn(),
  readBundleManifest: vi.fn(),
}))

vi.mock("@/lib/bundle-import", () => ({
  importBundleFromBuffer: mocks.importBundleFromBuffer,
  readBundleManifest: mocks.readBundleManifest,
}))

import { bundleRoutes } from "@/server/routes/bundle"

function buildMultipartBody(options: {
  fields?: Record<string, string>
  files: Array<{ field: string; filename: string; contentType: string; content: string }>
}) {
  const boundary = "----taxinator-test-boundary"
  const chunks: Buffer[] = []

  for (const [field, value] of Object.entries(options.fields ?? {})) {
    chunks.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${field}"\r\n\r\n` +
      `${value}\r\n`,
    ))
  }

  for (const file of options.files) {
    chunks.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${file.field}"; filename="${file.filename}"\r\n` +
      `Content-Type: ${file.contentType}\r\n\r\n` +
      `${file.content}\r\n`,
    ))
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`))

  return {
    boundary,
    payload: Buffer.concat(chunks),
  }
}

describe("bundle routes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns manifest metadata for an uploaded bundle", async () => {
    mocks.readBundleManifest.mockResolvedValue({
      version: "2.0",
      entity: {
        id: "acme",
        name: "Acme",
        type: "autonomo",
      },
      created: "2026-04-17T00:00:00.000Z",
      dbDumpFile: "database.sql",
    })

    const app = Fastify()
    await app.register(bundleRoutes)

    const body = buildMultipartBody({
      files: [
        {
          field: "bundle",
          filename: "backup.taxinator.zip",
          contentType: "application/zip",
          content: "zip-bytes",
        },
      ],
    })

    const response = await app.inject({
      method: "POST",
      url: "/api/bundle/manifest",
      headers: {
        "content-type": `multipart/form-data; boundary=${body.boundary}`,
      },
      payload: body.payload,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      success: true,
      manifest: {
        version: "2.0",
        entity: {
          id: "acme",
          name: "Acme",
          type: "autonomo",
        },
        created: "2026-04-17T00:00:00.000Z",
        dbDumpFile: "database.sql",
      },
    })
    expect(mocks.readBundleManifest).toHaveBeenCalledWith(Buffer.from("zip-bytes"))

    await app.close()
  })

  it("imports an uploaded bundle and returns the new entity id", async () => {
    mocks.importBundleFromBuffer.mockResolvedValue({
      entityId: "acme",
      entityName: "Acme",
      manifest: {
        version: "2.0",
        entity: {
          id: "acme",
          name: "Acme",
          type: "autonomo",
        },
        created: "2026-04-17T00:00:00.000Z",
        dbDumpFile: "database.sql",
      },
    })

    const app = Fastify()
    await app.register(bundleRoutes)

    const body = buildMultipartBody({
      fields: {
        entityName: "Acme",
        entityType: "autonomo",
      },
      files: [
        {
          field: "bundle",
          filename: "backup.taxinator.zip",
          contentType: "application/zip",
          content: "zip-bytes",
        },
      ],
    })

    const response = await app.inject({
      method: "POST",
      url: "/api/bundle/import",
      headers: {
        "content-type": `multipart/form-data; boundary=${body.boundary}`,
      },
      payload: body.payload,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      success: true,
      entityId: "acme",
    })
    expect(mocks.importBundleFromBuffer).toHaveBeenCalledWith(Buffer.from("zip-bytes"), {
      entityName: "Acme",
      entityType: "autonomo",
    })

    await app.close()
  })
})
