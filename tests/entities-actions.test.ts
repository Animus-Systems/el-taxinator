import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const cookieStore = {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  }

  return {
    cookieStore,
    cookies: vi.fn(async () => cookieStore),
    redirect: vi.fn((path: string) => {
      throw new Error(`redirect:${path}`)
    }),
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
    getRunningClusterEntityId: vi.fn(),
    stopCluster: vi.fn(),
    ensureSchema: vi.fn(),
    getSelfHostedUser: vi.fn(),
    getOrCreateSelfHostedUser: vi.fn(),
    createUserDefaults: vi.fn(),
    codeFromName: vi.fn(),
    rmSync: vi.fn(),
  }
})

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}))

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
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

vi.mock("@/lib/embedded-pg", () => ({
  getRunningClusterEntityId: mocks.getRunningClusterEntityId,
  stopCluster: mocks.stopCluster,
  initNewCluster: vi.fn(),
  getEntityDataDir: vi.fn(),
}))

vi.mock("@/lib/schema", () => ({
  ensureSchema: mocks.ensureSchema,
}))

vi.mock("@/models/users", () => ({
  getSelfHostedUser: mocks.getSelfHostedUser,
  getOrCreateSelfHostedUser: mocks.getOrCreateSelfHostedUser,
}))

vi.mock("@/models/defaults-server", () => ({
  createUserDefaults: mocks.createUserDefaults,
  isDatabaseEmpty: vi.fn(),
}))

vi.mock("@/lib/utils", () => ({
  codeFromName: mocks.codeFromName,
}))

vi.mock("fs", () => ({
  rmSync: mocks.rmSync,
}))

const { disconnectEntityAction, removeEntityAction } = await import("@/actions/entities")
const { disconnectAction } = await import("@/actions/auth")

describe("entity picker teardown actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.cookies.mockResolvedValue(mocks.cookieStore)
    mocks.cookieStore.get.mockReturnValue(undefined)
    mocks.getEntityById.mockReturnValue(undefined)
    mocks.getActiveEntityIdFromFile.mockReturnValue("other-company")
    mocks.getRunningClusterEntityId.mockReturnValue(null)
  })

  it("disconnects the active entity without exiting the server", async () => {
    mocks.getEntityById.mockReturnValue({
      id: "acme",
      name: "Acme SL",
      type: "sl",
    })
    mocks.cookieStore.get.mockReturnValue({ value: "acme" })
    mocks.getActiveEntityIdFromFile.mockReturnValue("acme")
    mocks.getRunningClusterEntityId.mockReturnValue("acme")

    const result = await disconnectEntityAction("acme")

    expect(result).toEqual({ success: true })
    expect(mocks.closePoolForEntity).toHaveBeenCalledWith("acme")
    expect(mocks.stopCluster).toHaveBeenCalledOnce()
    expect(mocks.removeEntity).toHaveBeenCalledWith("acme")
    expect(mocks.cookieStore.delete).toHaveBeenCalledWith("TAXINATOR_ENTITY")
    expect(mocks.clearActiveEntityFile).toHaveBeenCalledOnce()
  })

  it("disconnects an inactive entity without touching the current session", async () => {
    mocks.getEntityById.mockReturnValue({
      id: "archived",
      name: "Archived Co",
      type: "autonomo",
    })
    mocks.cookieStore.get.mockReturnValue({ value: "active-company" })
    mocks.getActiveEntityIdFromFile.mockReturnValue("active-company")
    mocks.getRunningClusterEntityId.mockReturnValue("active-company")

    const result = await disconnectEntityAction("archived")

    expect(result).toEqual({ success: true })
    expect(mocks.closePoolForEntity).toHaveBeenCalledWith("archived")
    expect(mocks.stopCluster).not.toHaveBeenCalled()
    expect(mocks.removeEntity).toHaveBeenCalledWith("archived")
    expect(mocks.cookieStore.delete).not.toHaveBeenCalled()
    expect(mocks.clearActiveEntityFile).not.toHaveBeenCalled()
  })

  it("deletes the active entity data after stopping its cluster", async () => {
    mocks.getEntityById.mockReturnValue({
      id: "acme",
      name: "Acme SL",
      type: "sl",
    })
    mocks.resolveEntityDir.mockReturnValue("/tmp/acme")
    mocks.cookieStore.get.mockReturnValue({ value: "acme" })
    mocks.getActiveEntityIdFromFile.mockReturnValue("acme")
    mocks.getRunningClusterEntityId.mockReturnValue("acme")

    const result = await removeEntityAction("acme")

    expect(result).toEqual({ success: true })
    expect(mocks.closePoolForEntity).toHaveBeenCalledWith("acme")
    expect(mocks.stopCluster).toHaveBeenCalledOnce()
    expect(mocks.removeEntity).toHaveBeenCalledWith("acme")
    expect(mocks.cookieStore.delete).toHaveBeenCalledWith("TAXINATOR_ENTITY")
    expect(mocks.clearActiveEntityFile).toHaveBeenCalledOnce()
    expect(mocks.rmSync).toHaveBeenCalledWith("/tmp/acme", { recursive: true, force: true })
  })

  it("removes external entities without trying to delete a local data directory", async () => {
    mocks.getEntityById.mockReturnValue({
      id: "remote",
      name: "Remote Co",
      type: "sl",
      db: "postgres://remote",
    })

    const result = await removeEntityAction("remote")

    expect(result).toEqual({ success: true })
    expect(mocks.resolveEntityDir).not.toHaveBeenCalled()
    expect(mocks.rmSync).not.toHaveBeenCalled()
  })

  it("disconnectAction clears the active session without touching the running cluster", async () => {
    mocks.cookieStore.get.mockReturnValue({ value: "acme" })
    mocks.getRunningClusterEntityId.mockReturnValue("acme")

    const result = await disconnectAction()

    expect(result).toEqual({ success: true })
    expect(mocks.cookieStore.delete).toHaveBeenCalledWith("TAXINATOR_ENTITY")
    expect(mocks.clearActiveEntityFile).toHaveBeenCalledOnce()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })
})
