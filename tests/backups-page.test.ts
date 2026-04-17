import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
}))

vi.mock("~/trpc", () => ({
  trpc: {
    settings: {
      get: {
        useQuery: mocks.useQuery,
      },
    },
  },
}))

import { BackupsSettingsPage } from "@/src/routes/_app/settings/backups"

describe("BackupsSettingsPage", () => {
  beforeEach(() => {
    mocks.useQuery.mockReset()
    ;(globalThis as Record<string, unknown>).window = {
      location: { search: "" },
    }
  })

  it("passes a real Google Drive connect URL once OAuth credentials are configured", () => {
    mocks.useQuery.mockReturnValue({
      isLoading: false,
      data: {
        google_drive_client_id: "client-id-1",
        google_drive_client_secret: "client-secret-1",
      },
    })

    const tree = BackupsSettingsPage() as {
      props: { children: { props: Record<string, unknown> } }
    }
    const childProps = tree.props.children.props

    expect(childProps["isGoogleDriveConfigured"]).toBe(true)
    expect(childProps["googleAuthUrl"]).toBe("/api/auth/google-drive")
  })
})
