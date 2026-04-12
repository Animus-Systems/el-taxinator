import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getActiveEntityId: vi.fn(),
  updateEntity: vi.fn(),
  uploadStaticImage: vi.fn(),
  updateUser: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({
  getCurrentUser: mocks.getCurrentUser,
}))

vi.mock("@/lib/entities", () => ({
  getActiveEntityId: mocks.getActiveEntityId,
  updateEntity: mocks.updateEntity,
}))

vi.mock("@/lib/uploads", () => ({
  uploadStaticImage: mocks.uploadStaticImage,
}))

vi.mock("@/models/users", () => ({
  updateUser: mocks.updateUser,
}))

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}))

const { saveProfileAction } = await import("@/actions/settings")

describe("saveProfileAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCurrentUser.mockResolvedValue({
      id: "user-1",
      name: "Self Hosted",
      avatar: null,
      businessName: "Old Business Name",
      businessAddress: null,
      businessBankDetails: null,
      businessLogo: null,
    })
    mocks.getActiveEntityId.mockResolvedValue("entity-1")
    mocks.updateUser.mockResolvedValue({
      id: "user-1",
    })
  })

  it("syncs the active entity name from businessName", async () => {
    const formData = new FormData()
    formData.set("businessName", "New Business Name")

    const result = await saveProfileAction(null, formData)

    expect(result).toEqual({ success: true })
    expect(mocks.updateUser).toHaveBeenCalledWith("user-1", expect.objectContaining({
      businessName: "New Business Name",
    }))
    expect(mocks.updateEntity).toHaveBeenCalledWith("entity-1", { name: "New Business Name" })
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout")
  })

  it("does not blank the entity name when businessName is empty", async () => {
    const formData = new FormData()
    formData.set("businessName", "   ")

    const result = await saveProfileAction(null, formData)

    expect(result).toEqual({ success: true })
    expect(mocks.updateEntity).not.toHaveBeenCalled()
  })
})
