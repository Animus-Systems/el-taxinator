import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { createRateLimitHeaders } from "@/lib/rate-limit"
import type { RateLimitResult } from "@/lib/rate-limit"

// We test the pure functions and the checkRateLimit logic via createAuthRateLimiter
// The rate limiter uses Request objects, so we create minimal mock requests

function createMockRequest(ip = "127.0.0.1", userAgent = "test-agent"): Request {
  return new Request("http://localhost:7331/api/test", {
    headers: {
      "x-forwarded-for": ip,
      "user-agent": userAgent,
    },
  })
}

describe("createRateLimitHeaders", () => {
  it("includes remaining and reset headers for allowed request", () => {
    const result: RateLimitResult = {
      allowed: true,
      remaining: 4,
      resetAt: Date.now() + 60000,
    }
    const headers = createRateLimitHeaders(result)
    expect(headers["X-RateLimit-Remaining"]).toBe("4")
    expect(headers["X-RateLimit-Reset"]).toBeDefined()
  })

  it("includes Retry-After header when blocked", () => {
    const result: RateLimitResult = {
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60000,
      retryAfter: 60,
    }
    const headers = createRateLimitHeaders(result)
    expect(headers["Retry-After"]).toBe("60")
    expect(headers["X-RateLimit-Retry-After-Seconds"]).toBe("60")
    expect(headers["X-RateLimit-Remaining"]).toBe("0")
  })

  it("does not include Retry-After when allowed", () => {
    const result: RateLimitResult = {
      allowed: true,
      remaining: 3,
      resetAt: Date.now() + 60000,
    }
    const headers = createRateLimitHeaders(result)
    expect(headers["Retry-After"]).toBeUndefined()
  })
})

describe("createAuthRateLimiter", () => {
  // We need to re-import per test to get a fresh rate limit store
  // The store is module-level, so we use dynamic imports

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("allows requests within limit", async () => {
    // Reset modules to get fresh store
    vi.resetModules()
    const { createAuthRateLimiter } = await import("@/lib/rate-limit")
    const limiter = createAuthRateLimiter()
    const request = createMockRequest("10.0.0.1", "unique-agent-1")

    const result1 = limiter.login(request)
    expect(result1.allowed).toBe(true)
    expect(result1.remaining).toBe(4)

    const result2 = limiter.login(request)
    expect(result2.allowed).toBe(true)
    expect(result2.remaining).toBe(3)
  })

  it("blocks requests exceeding the login limit (5 per 15 min)", async () => {
    vi.resetModules()
    const { createAuthRateLimiter } = await import("@/lib/rate-limit")
    const limiter = createAuthRateLimiter()
    const request = createMockRequest("10.0.0.2", "unique-agent-2")

    // Make 5 allowed requests
    for (let i = 0; i < 5; i++) {
      const result = limiter.login(request)
      expect(result.allowed).toBe(true)
    }

    // 6th request should be blocked
    const blocked = limiter.login(request)
    expect(blocked.allowed).toBe(false)
    expect(blocked.remaining).toBe(0)
    expect(blocked.retryAfter).toBeDefined()
    expect(blocked.retryAfter!).toBeGreaterThan(0)
  })

  it("resets after window expires", async () => {
    vi.resetModules()
    const { createAuthRateLimiter } = await import("@/lib/rate-limit")
    const limiter = createAuthRateLimiter()
    const request = createMockRequest("10.0.0.3", "unique-agent-3")

    // Exhaust the login limit
    for (let i = 0; i < 5; i++) {
      limiter.login(request)
    }
    const blocked = limiter.login(request)
    expect(blocked.allowed).toBe(false)

    // Advance past the 15-minute window
    vi.advanceTimersByTime(15 * 60 * 1000 + 1)

    // Should be allowed again
    const afterReset = limiter.login(request)
    expect(afterReset.allowed).toBe(true)
    expect(afterReset.remaining).toBe(4)
  })

  it("tracks different keys independently", async () => {
    vi.resetModules()
    const { createAuthRateLimiter } = await import("@/lib/rate-limit")
    const limiter = createAuthRateLimiter()
    const request1 = createMockRequest("192.168.1.1", "unique-agent-4")
    const request2 = createMockRequest("192.168.1.2", "unique-agent-5")

    // Exhaust limit for request1
    for (let i = 0; i < 5; i++) {
      limiter.login(request1)
    }
    const blocked = limiter.login(request1)
    expect(blocked.allowed).toBe(false)

    // request2 should still be allowed
    const allowed = limiter.login(request2)
    expect(allowed.allowed).toBe(true)
  })

  it("signup has stricter limits (3 per hour)", async () => {
    vi.resetModules()
    const { createAuthRateLimiter } = await import("@/lib/rate-limit")
    const limiter = createAuthRateLimiter()
    const request = createMockRequest("10.0.0.4", "unique-agent-6")

    for (let i = 0; i < 3; i++) {
      const result = limiter.signup(request)
      expect(result.allowed).toBe(true)
    }

    const blocked = limiter.signup(request)
    expect(blocked.allowed).toBe(false)
  })

  it("general limit allows more requests (20 per minute)", async () => {
    vi.resetModules()
    const { createAuthRateLimiter } = await import("@/lib/rate-limit")
    const limiter = createAuthRateLimiter()
    const request = createMockRequest("10.0.0.5", "unique-agent-7")

    for (let i = 0; i < 20; i++) {
      const result = limiter.general(request)
      expect(result.allowed).toBe(true)
    }

    const blocked = limiter.general(request)
    expect(blocked.allowed).toBe(false)
  })
})
