import { beforeEach, describe, expect, it, vi } from "vitest"

import { importBundleAction, readBundleManifestAction } from "@/src/compat/actions/bundle"

describe("bundle compat actions", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal("fetch", vi.fn())
    ;(globalThis as Record<string, unknown>).window = {
      location: { origin: "http://localhost:7331" },
    }
  })

  it("posts the uploaded bundle to the manifest endpoint", async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
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
      }),
    } as Response)

    const formData = new FormData()
    formData.append("bundle", new File(["zip"], "backup.taxinator.zip"))

    const result = await readBundleManifestAction(formData)

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:7331/api/bundle/manifest",
      expect.objectContaining({
        method: "POST",
        body: formData,
      }),
    )
    expect(result).toEqual({
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
  })

  it("posts the uploaded bundle to the import endpoint", async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        entityId: "acme",
      }),
    } as Response)

    const formData = new FormData()
    formData.append("bundle", new File(["zip"], "backup.taxinator.zip"))
    formData.append("entityName", "Acme")
    formData.append("entityType", "autonomo")

    const result = await importBundleAction(formData)

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:7331/api/bundle/import",
      expect.objectContaining({
        method: "POST",
        body: formData,
      }),
    )
    expect(result).toEqual({
      success: true,
      entityId: "acme",
    })
  })
})
