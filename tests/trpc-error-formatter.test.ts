import { describe, it, expect } from "vitest"
import { TRPCError } from "@trpc/server"
import { sanitizeTrpcMessage } from "@/lib/trpc/init"

describe("sanitizeTrpcMessage", () => {
  it("sanitizes INTERNAL_SERVER_ERROR messages with leaky content", () => {
    const cause = new Error(
      `duplicate key value violates unique constraint "users_email_key"`,
    )
    const message = sanitizeTrpcMessage("INTERNAL_SERVER_ERROR", cause, cause.message)
    expect(message).not.toContain("duplicate key")
    expect(message.toLowerCase()).toContain("duplicate entry")
  })

  it("sanitizes plain-Error causes even under non-INTERNAL codes", () => {
    const cause = new Error("prisma: connection refused to db")
    const message = sanitizeTrpcMessage("NOT_FOUND", cause, cause.message)
    expect(message.toLowerCase()).toContain("database error")
  })

  it("passes through explicit TRPCError causes unchanged", () => {
    const cause = new TRPCError({
      code: "BAD_REQUEST",
      message: "human-friendly message",
    })
    const message = sanitizeTrpcMessage("BAD_REQUEST", cause, cause.message)
    expect(message).toBe("human-friendly message")
  })

  it("rewrites benign internal messages to the generic fallback", () => {
    const cause = new Error("TURN_IN_PROGRESS")
    const message = sanitizeTrpcMessage("INTERNAL_SERVER_ERROR", cause, cause.message)
    expect(message.toLowerCase()).toContain("unexpected error")
  })
})
