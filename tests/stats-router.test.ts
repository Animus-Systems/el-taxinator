import { beforeEach, describe, expect, it, vi } from "vitest"

import type { User } from "@/lib/db-types"
import { createCallerFactory } from "@/lib/trpc/init"

const mocks = vi.hoisted(() => ({
  getDashboardAnalytics: vi.fn(),
  getDashboardStats: vi.fn(),
  getProjectStats: vi.fn(),
  getTimeSeriesStats: vi.fn(),
}))

vi.mock("@/models/stats", () => ({
  getDashboardAnalytics: mocks.getDashboardAnalytics,
  getDashboardStats: mocks.getDashboardStats,
  getProjectStats: mocks.getProjectStats,
  getTimeSeriesStats: mocks.getTimeSeriesStats,
}))

import { statsRouter } from "@/lib/trpc/routers/stats"

const createCaller = createCallerFactory(statsRouter)

const user = {
  id: "user-1",
  email: "taxhacker@localhost",
  name: "Self-Hosted Mode",
  avatar: null,
  createdAt: new Date("2026-04-16T00:00:00.000Z"),
  updatedAt: new Date("2026-04-16T00:00:00.000Z"),
  stripeCustomerId: null,
  membershipPlan: "unlimited",
  membershipExpiresAt: null,
  emailVerified: false,
  storageUsed: 0,
  storageLimit: -1,
  aiBalance: 0,
  businessName: null,
  businessAddress: null,
  businessBankDetails: null,
  businessLogo: null,
  businessTaxId: null,
  entityType: null,
} satisfies User

describe("statsRouter.analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns the dashboard analytics payload and defaults currency to EUR", async () => {
    mocks.getDashboardAnalytics.mockResolvedValue({
      timeSeries: [
        {
          period: "2026-01",
          income: 1200,
          expenses: 700,
          date: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
      categoryBreakdown: [
        {
          code: "software",
          name: "Software",
          color: "#0d9488",
          expenses: 420,
          transactionCount: 3,
        },
      ],
      topMerchants: [
        {
          merchant: "Google Workspace",
          expenses: 210,
          transactionCount: 2,
        },
      ],
      profitTrend: [
        {
          period: "2026-01",
          profit: 500,
          date: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
      otherCurrencies: [
        { currency: "USD", transactionCount: 2 },
      ],
    })

    const caller = createCaller({ user })
    const result = await caller.analytics({
      dateFrom: "2026-01-01",
      dateTo: "2026-02-29",
    })

    expect(result).toMatchObject({
      timeSeries: [
        {
          period: "2026-01",
          income: 1200,
          expenses: 700,
          date: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
      categoryBreakdown: [
        {
          code: "software",
          name: "Software",
          color: "#0d9488",
          expenses: 420,
          transactionCount: 3,
        },
      ],
      topMerchants: [
        {
          merchant: "Google Workspace",
          expenses: 210,
          transactionCount: 2,
        },
      ],
      profitTrend: [
        {
          period: "2026-01",
          profit: 500,
          date: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
    })
    expect(mocks.getDashboardAnalytics).toHaveBeenCalledWith(
      "user-1",
      { dateFrom: "2026-01-01", dateTo: "2026-02-29" },
      "EUR",
    )
  })

  it("forwards a caller-supplied currency unchanged", async () => {
    mocks.getDashboardAnalytics.mockResolvedValue({
      timeSeries: [],
      categoryBreakdown: [],
      topMerchants: [],
      profitTrend: [],
      otherCurrencies: [],
    })

    const caller = createCaller({ user })
    await caller.analytics({
      currency: "USD",
      dateFrom: "2026-01-01",
      dateTo: "2026-02-29",
    })

    expect(mocks.getDashboardAnalytics).toHaveBeenCalledWith(
      "user-1",
      { dateFrom: "2026-01-01", dateTo: "2026-02-29" },
      "USD",
    )
  })

  it("rejects callers without an authenticated user", async () => {
    const caller = createCaller({ user: null })

    await expect(
      caller.analytics({
        dateFrom: "2026-01-01",
        dateTo: "2026-02-29",
      }),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    })
    expect(mocks.getDashboardAnalytics).not.toHaveBeenCalled()
  })
})
