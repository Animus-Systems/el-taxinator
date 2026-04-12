import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getEntities: vi.fn(() => []),
  getEntityById: vi.fn(),
  addEntity: vi.fn(),
  updateEntity: vi.fn(),
  removeEntity: vi.fn(),
  testDatabaseConnection: vi.fn(),
  closePoolForEntity: vi.fn(),
  setActiveEntity: vi.fn(),
  getActiveEntityIdFromFile: vi.fn(),
  resolveEntityDir: vi.fn(),
  clearActiveEntityFile: vi.fn(),
  codeFromName: vi.fn(),
  folderNameFromName: vi.fn(),
  initNewCluster: vi.fn(),
  getEntityDataDir: vi.fn(),
  mkdirSync: vi.fn(),
  connectAction: vi.fn(),
}))

vi.mock("@/lib/entities", () => ({
  ENTITY_COOKIE: "TAXINATOR_ENTITY",
  getEntities: mocks.getEntities,
  getEntityById: mocks.getEntityById,
  addEntity: mocks.addEntity,
  updateEntity: mocks.updateEntity,
  removeEntity: mocks.removeEntity,
  testDatabaseConnection: mocks.testDatabaseConnection,
  closePoolForEntity: mocks.closePoolForEntity,
  setActiveEntity: mocks.setActiveEntity,
  getActiveEntityIdFromFile: mocks.getActiveEntityIdFromFile,
  resolveEntityDir: mocks.resolveEntityDir,
  clearActiveEntityFile: mocks.clearActiveEntityFile,
}))

vi.mock("@/lib/utils", () => ({
  codeFromName: mocks.codeFromName,
  folderNameFromName: mocks.folderNameFromName,
}))

vi.mock("@/lib/embedded-pg", () => ({
  initNewCluster: mocks.initNewCluster,
  getEntityDataDir: mocks.getEntityDataDir,
}))

vi.mock("@/actions/auth", () => ({
  connectAction: mocks.connectAction,
}))

vi.mock("fs", () => ({
  mkdirSync: mocks.mkdirSync,
}))

const { createLocalEntityAction } = await import("@/actions/entities")

describe("createLocalEntityAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getEntities.mockReturnValue([])
    mocks.codeFromName.mockReturnValue("marcin_jacek_cho")
    mocks.folderNameFromName.mockReturnValue("marcin-jacek-cho")
    mocks.getEntityDataDir.mockReturnValue("/tmp/marcin_jacek_cho")
    mocks.connectAction.mockResolvedValue({ success: true })
  })

  it("bootstraps the new company by delegating to connectAction", async () => {
    const result = await createLocalEntityAction({
      name: "Marcin Jacek Choscilowicz",
      type: "autonomo",
      dataDir: "/tmp/company-root",
    })

    expect(result).toEqual({ success: true, entityId: "marcin_jacek_cho" })
    expect(mocks.initNewCluster).toHaveBeenCalledWith("marcin_jacek_cho", "/tmp/company-root/marcin-jacek-cho")
    expect(mocks.mkdirSync).toHaveBeenCalledWith("/tmp/company-root/marcin-jacek-cho/uploads", { recursive: true })
    expect(mocks.addEntity).toHaveBeenCalledWith({
      id: "marcin_jacek_cho",
      name: "Marcin Jacek Choscilowicz",
      type: "autonomo",
      dataDir: "/tmp/company-root/marcin-jacek-cho",
    })
    expect(mocks.connectAction).toHaveBeenCalledWith("marcin_jacek_cho")
  })

  it("returns bootstrap errors from connectAction", async () => {
    mocks.connectAction.mockResolvedValue({
      success: false,
      error: "Failed to initialize database schema",
    })

    const result = await createLocalEntityAction({
      name: "Marcin Jacek Choscilowicz",
      type: "autonomo",
    })

    expect(result).toEqual({
      success: false,
      error: "Failed to initialize database schema",
    })
  })
})
