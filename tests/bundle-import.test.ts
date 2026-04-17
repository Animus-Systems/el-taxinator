import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import JSZip from "jszip"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  execFileSync: vi.fn(),
  addEntity: vi.fn(),
  closeAllPools: vi.fn(),
  getActiveEntityIdFromFile: vi.fn(),
  getEntities: vi.fn(),
  getEntityById: vi.fn(),
  getPoolForEntity: vi.fn(),
  removeEntity: vi.fn(),
  resolveEntityDir: vi.fn(),
  setActiveEntity: vi.fn(),
  buildConnectionString: vi.fn(),
  getEntityDataDir: vi.fn(),
  initNewCluster: vi.fn(),
  startCluster: vi.fn(),
  stopCluster: vi.fn(),
  ensureSchema: vi.fn(),
  forgetSharedIncomeSourcesForEntity: vi.fn(),
  recordSharedIncomeSource: vi.fn(),
  listIncomeSources: vi.fn(),
  getOrCreateSelfHostedUser: vi.fn(),
}))

vi.mock("child_process", () => ({
  execFileSync: mocks.execFileSync,
}))

vi.mock("@/lib/entities", () => ({
  addEntity: mocks.addEntity,
  closeAllPools: mocks.closeAllPools,
  getActiveEntityIdFromFile: mocks.getActiveEntityIdFromFile,
  getEntities: mocks.getEntities,
  getEntityById: mocks.getEntityById,
  getPoolForEntity: mocks.getPoolForEntity,
  removeEntity: mocks.removeEntity,
  resolveEntityDir: mocks.resolveEntityDir,
  setActiveEntity: mocks.setActiveEntity,
}))

vi.mock("@/lib/embedded-pg", () => ({
  buildConnectionString: mocks.buildConnectionString,
  getEntityDataDir: mocks.getEntityDataDir,
  initNewCluster: mocks.initNewCluster,
  startCluster: mocks.startCluster,
  stopCluster: mocks.stopCluster,
}))

vi.mock("@/lib/schema", () => ({
  ensureSchema: mocks.ensureSchema,
}))

vi.mock("@/lib/shared-income-sources", () => ({
  forgetSharedIncomeSourcesForEntity: mocks.forgetSharedIncomeSourcesForEntity,
  recordSharedIncomeSource: mocks.recordSharedIncomeSource,
}))

vi.mock("@/models/income-sources", () => ({
  listIncomeSources: mocks.listIncomeSources,
}))

vi.mock("@/models/users", () => ({
  getOrCreateSelfHostedUser: mocks.getOrCreateSelfHostedUser,
}))

import { importBundleFromBuffer, readBundleManifest } from "@/lib/bundle-import"

describe("bundle import helper", () => {
  let tempRoot: string

  beforeEach(() => {
    vi.clearAllMocks()
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "taxinator-bundle-import-"))

    mocks.getActiveEntityIdFromFile.mockReturnValue("existing")
    mocks.getEntities.mockReturnValue([])
    mocks.getEntityById.mockImplementation((entityId: string) => {
      if (entityId === "existing") {
        return {
          id: "existing",
          name: "Existing Company",
          type: "autonomo",
          dataDir: path.join(tempRoot, "existing"),
        }
      }
      return undefined
    })
    mocks.resolveEntityDir.mockImplementation((entityId: string) => path.join(tempRoot, entityId))
    mocks.getEntityDataDir.mockImplementation((entityId: string) => path.join(tempRoot, entityId))
    mocks.buildConnectionString.mockReturnValue("postgresql://taxinator:secret@127.0.0.1:54321/taxinator")
    mocks.startCluster.mockImplementation(async (entityId: string, dataDir?: string) => ({
      host: "127.0.0.1",
      port: 54321,
      user: "taxinator",
      password: "secret",
      dataDir: dataDir ?? path.join(tempRoot, entityId),
    }))
    mocks.getPoolForEntity.mockResolvedValue({ query: vi.fn() })
    mocks.ensureSchema.mockResolvedValue({ status: "up_to_date" })
    mocks.getOrCreateSelfHostedUser.mockResolvedValue({ id: "user-1" })
    mocks.listIncomeSources.mockResolvedValue([
      {
        id: "income-1",
        kind: "salary",
        name: "Animus Systems SL",
        taxId: "ESB09801200",
        metadata: {},
        updatedAt: new Date("2026-04-17T10:00:00.000Z"),
      },
    ])
  })

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  it("reads manifest metadata from a portable bundle", async () => {
    const zip = new JSZip()
    zip.file("manifest.json", JSON.stringify({
      version: "2.0",
      entity: {
        id: "acme",
        name: "Acme",
        type: "autonomo",
      },
      created: "2026-04-17T00:00:00.000Z",
      dbDumpFile: "database.sql",
    }))
    zip.file("database.sql", "SELECT 1;")

    const manifest = await readBundleManifest(
      Buffer.from(await zip.generateAsync({ type: "uint8array" })),
    )

    expect(manifest).toEqual({
      version: "2.0",
      entity: {
        id: "acme",
        name: "Acme",
        type: "autonomo",
      },
      created: "2026-04-17T00:00:00.000Z",
      dbDumpFile: "database.sql",
    })
  })

  it("restores the database dump and uploaded files into a new entity", async () => {
    const zip = new JSZip()
    zip.file("manifest.json", JSON.stringify({
      version: "2.0",
      entity: {
        id: "marcin_jacek_choscilowicz",
        name: "Imported Co",
        type: "autonomo",
      },
      created: "2026-04-17T00:00:00.000Z",
      dbDumpFile: "database.sql",
    }))
    zip.file("database.sql", "CREATE TABLE test_table(id int);")
    zip.file("uploads/2026/04/receipt.pdf", Buffer.from("pdf-bytes"))

    const result = await importBundleFromBuffer(
      Buffer.from(await zip.generateAsync({ type: "uint8array" })),
      {
        entityName: "Imported Co",
        entityType: "autonomo",
      },
    )

    expect(result.entityId).toBe("imported_co")
    expect(mocks.execFileSync).toHaveBeenCalledWith(
      "psql",
      [
        "--single-transaction",
        "--set",
        "ON_ERROR_STOP=1",
        "postgresql://taxinator:secret@127.0.0.1:54321/taxinator",
      ],
      expect.objectContaining({
        input: "CREATE TABLE test_table(id int);",
      }),
    )
    expect(mocks.addEntity).toHaveBeenCalledWith({
      id: "imported_co",
      name: "Imported Co",
      type: "autonomo",
      dataDir: path.join(tempRoot, "imported_co"),
    })
    expect(mocks.setActiveEntity).toHaveBeenCalledWith("imported_co")
    expect(mocks.ensureSchema).toHaveBeenCalled()
    expect(mocks.recordSharedIncomeSource).toHaveBeenCalledWith({
      entityId: "imported_co",
      entityName: "Imported Co",
      id: "income-1",
      kind: "salary",
      name: "Animus Systems SL",
      taxId: "ESB09801200",
      metadata: {},
      updatedAt: "2026-04-17T10:00:00.000Z",
    })

    const restoredUpload = path.join(tempRoot, "imported_co", "uploads", "2026", "04", "receipt.pdf")
    expect(fs.readFileSync(restoredUpload, "utf-8")).toBe("pdf-bytes")
  })
})
