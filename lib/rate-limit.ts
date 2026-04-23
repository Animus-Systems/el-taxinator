/**
 * Rate Limiting Utility
 * 
 * Provides rate limiting functionality for sensitive endpoints like authentication.
 * Uses in-memory storage with sliding window algorithm.
 * 
 * In production, replace with Redis-based implementation for distributed deployments.
 */

interface RateLimitEntry {
  count: number
  resetAt: number
  lastRequest: number
}

interface RateLimitConfig {
  windowMs: number      // Time window in milliseconds
  maxRequests: number   // Maximum requests per window
  keyPrefix: string     // Prefix for rate limit keys
}

interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
  retryAfter?: number   // Seconds until retry is allowed (only if not allowed)
}

// In-memory store (use Redis in production for distributed systems)
const rateLimitStore = new Map<string, RateLimitEntry>()

// Clean up expired entries periodically (every 5 minutes)
const CLEANUP_INTERVAL = 5 * 60 * 1000
let lastCleanup = Date.now()

function cleanupExpiredEntries(): void {
  if (Date.now() - lastCleanup < CLEANUP_INTERVAL) return
  
  const now = Date.now()
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key)
    }
  }
  lastCleanup = Date.now()
}

import { createHash } from "crypto"

/**
 * Hash ip + user-agent into a 16-char key. Exported so Fastify/tRPC adapters
 * can derive a key without materializing a Web `Request`.
 */
export function deriveClientKey(ip: string, userAgent: string): string {
  return createHash("sha256").update(`${ip}:${userAgent}`).digest("hex").substring(0, 16)
}

/**
 * Get client identifier from a Web-Fetch `Request`
 */
function getClientIdentifier(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")
  const realIp = request.headers.get("x-real-ip")
  const cfConnectingIp = request.headers.get("cf-connecting-ip")

  const ip = forwarded?.split(",")[0]?.trim()
    || realIp
    || cfConnectingIp
    || "unknown"

  const userAgent = request.headers.get("user-agent") || "unknown"
  return deriveClientKey(ip, userAgent)
}

/**
 * Check and update rate limit for a derived client key. Exported so callers
 * outside the Web-`Request` world (Fastify, tRPC) can drive the limiter
 * with a key they built themselves.
 */
export function checkRateLimitByKey(key: string, config: RateLimitConfig): RateLimitResult {
  return checkRateLimit(key, config)
}

/**
 * Check and update rate limit for a client
 */
function checkRateLimit(identifier: string, config: RateLimitConfig): RateLimitResult {
  cleanupExpiredEntries()
  
  const now = Date.now()
  const entry = rateLimitStore.get(config.keyPrefix + identifier)
  
  // No existing entry - create new one
  if (!entry || entry.resetAt < now) {
    const newEntry: RateLimitEntry = {
      count: 1,
      resetAt: now + config.windowMs,
      lastRequest: now,
    }
    rateLimitStore.set(config.keyPrefix + identifier, newEntry)
    
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: newEntry.resetAt,
    }
  }
  
  // Within window - increment counter
  entry.count++
  entry.lastRequest = now
  
  if (entry.count > config.maxRequests) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      retryAfter,
    }
  }
  
  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  }
}

/**
 * Create a rate limiter for authentication endpoints
 * 
 * Default limits:
 * - Login attempts: 5 per 15 minutes
 * - Signup attempts: 3 per hour
 * - OTP requests: 5 per 15 minutes
 * - Password reset: 3 per hour
 */
export function createAuthRateLimiter() {
  return {
    /**
     * Rate limit for login attempts
     * 5 attempts per 15 minutes
     */
    login: (request: Request) => checkRateLimit(getClientIdentifier(request), {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 5,
      keyPrefix: "auth:login:",
    }),
    
    /**
     * Rate limit for signup attempts
     * 3 attempts per hour
     */
    signup: (request: Request) => checkRateLimit(getClientIdentifier(request), {
      windowMs: 60 * 60 * 1000, // 1 hour
      maxRequests: 3,
      keyPrefix: "auth:signup:",
    }),
    
    /**
     * Rate limit for OTP/code requests
     * 5 requests per 15 minutes
     */
    otpRequest: (request: Request) => checkRateLimit(getClientIdentifier(request), {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 5,
      keyPrefix: "auth:otp:",
    }),
    
    /**
     * Rate limit for password reset
     * 3 requests per hour
     */
    passwordReset: (request: Request) => checkRateLimit(getClientIdentifier(request), {
      windowMs: 60 * 60 * 1000, // 1 hour
      maxRequests: 3,
      keyPrefix: "auth:pwreset:",
    }),
    
    /**
     * Rate limit for general API authentication endpoints
     * 20 requests per minute
     */
    general: (request: Request) => checkRateLimit(getClientIdentifier(request), {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 20,
      keyPrefix: "auth:general:",
    }),
  }
}

/**
 * Create rate limit response headers
 */
export function createRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
  }
  
  if (!result.allowed && result.retryAfter !== undefined) {
    headers["Retry-After"] = String(result.retryAfter)
    headers["X-RateLimit-Retry-After-Seconds"] = String(result.retryAfter)
  }
  
  return headers
}

/**
 * Middleware-style rate limit check for API routes
 * Returns response if rate limited, null if allowed
 */
export function checkRateLimitAndRespond(
  request: Request,
  limiter: (request: Request) => RateLimitResult
): Response | null {
  const result = limiter(request)
  const headers = createRateLimitHeaders(result)
  
  if (!result.allowed) {
    return new Response(
      JSON.stringify({
        error: "Too many requests. Please try again later.",
        retryAfter: result.retryAfter,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
      }
    )
  }
  
  return null // Not rate limited, proceed
}

// Export types for use in API routes
export type { RateLimitResult, RateLimitConfig }
