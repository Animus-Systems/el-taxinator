import { describe, it, expect } from "vitest"
import {
  chatMessageRoleSchema,
  chatMessageSchema,
  chatMessageMetadataSchema,
  proposedRuleSchema,
  proposedUpdateSchema,
} from "@/lib/db-types"
import {
  proposedActionSchema,
} from "@/lib/db-types"

describe("chat zod schemas", () => {
  it("validates a proposed rule", () => {
    const parsed = proposedRuleSchema.parse({
      name: "AWS bills",
      matchType: "contains",
      matchField: "merchant",
      matchValue: "AWS",
      categoryCode: "software",
      reason: "user described this pattern",
    })
    expect(parsed.matchType).toBe("contains")
  })

  it("validates a proposed transaction update", () => {
    const parsed = proposedUpdateSchema.parse({
      transactionId: "11111111-1111-1111-8111-111111111111",
      patch: { categoryCode: "software", note: "updated" },
      reason: "matches a pattern you described",
    })
    expect(parsed.patch.categoryCode).toBe("software")
  })

  it("validates a full chat message with metadata", () => {
    const parsed = chatMessageSchema.parse({
      id: "22222222-2222-2222-2222-222222222222",
      userId: "33333333-3333-3333-3333-333333333333",
      role: "assistant",
      content: "Here you go.",
      metadata: {
        proposedRule: {
          name: "AWS",
          matchType: "contains",
          matchField: "merchant",
          matchValue: "AWS",
          reason: "r",
        },
      },
      status: "sent",
      appliedAt: null,
      createdAt: new Date(),
    })
    expect(parsed.role).toBe("assistant")
  })

  it("rejects an unknown role", () => {
    expect(() => chatMessageRoleSchema.parse("foo")).toThrow()
  })

  it("allows metadata to be null", () => {
    const parsed = chatMessageMetadataSchema.nullable().parse(null)
    expect(parsed).toBeNull()
  })
})

describe("proposedAction discriminated union", () => {
  it("parses createRule action", () => {
    const a = proposedActionSchema.parse({
      kind: "createRule",
      name: "AWS", matchType: "contains", matchField: "merchant",
      matchValue: "AWS", categoryCode: "software", reason: "r",
    })
    expect(a.kind).toBe("createRule")
  })

  it("parses applyRuleToExisting with nested ruleSpec", () => {
    const a = proposedActionSchema.parse({
      kind: "applyRuleToExisting",
      ruleSpec: {
        name: "AWS", matchType: "contains", matchField: "merchant",
        matchValue: "AWS", categoryCode: "software",
      },
      alsoCreate: true,
      reason: "backfill",
    })
    if (a.kind !== "applyRuleToExisting") throw new Error("wrong kind")
    expect(a.ruleSpec.matchValue).toBe("AWS")
    expect(a.alsoCreate).toBe(true)
  })

  it("parses bulkUpdate action", () => {
    const a = proposedActionSchema.parse({
      kind: "bulkUpdate",
      filter: { merchant: "AWS", type: "expense" },
      patch: { categoryCode: "software" },
      reason: "r",
    })
    if (a.kind !== "bulkUpdate") throw new Error("wrong kind")
    expect(a.filter.merchant).toBe("AWS")
  })

  it("parses createCategory action", () => {
    const a = proposedActionSchema.parse({
      kind: "createCategory",
      name: "Software",
      reason: "r",
    })
    expect(a.kind).toBe("createCategory")
  })

  it("parses deleteTransaction action", () => {
    const a = proposedActionSchema.parse({
      kind: "deleteTransaction",
      transactionId: "11111111-1111-1111-8111-111111111111",
      reason: "r",
    })
    expect(a.kind).toBe("deleteTransaction")
  })

  it("rejects unknown kind", () => {
    expect(() =>
      proposedActionSchema.parse({ kind: "launchRocket", reason: "r" }),
    ).toThrow()
  })
})
