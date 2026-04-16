import { describe, expect, it } from "vitest"

import type { User } from "@/lib/db-types"
import { normalizeUserOutput } from "@/models/users"

describe("normalizeUserOutput", () => {
  it("maps isEmailVerified to emailVerified for API output validation", () => {
    const normalized = normalizeUserOutput({
      id: "user-1",
      email: "taxhacker@localhost",
      name: "Self-Hosted Mode",
      avatar: null,
      createdAt: new Date("2026-04-16T00:00:00.000Z"),
      updatedAt: new Date("2026-04-16T00:00:00.000Z"),
      stripeCustomerId: null,
      membershipPlan: "unlimited",
      membershipExpiresAt: null,
      isEmailVerified: false,
      storageUsed: 0,
      storageLimit: -1,
      aiBalance: 0,
      businessName: null,
      businessAddress: null,
      businessBankDetails: null,
      businessLogo: null,
      businessTaxId: null,
      entityType: null,
    } as User & { isEmailVerified: boolean })

    expect(normalized).not.toBeNull()
    if (!normalized) {
      throw new Error("normalized user should not be null")
    }

    expect(normalized.emailVerified).toBe(false)
    expect("isEmailVerified" in normalized).toBe(false)
  })
})
