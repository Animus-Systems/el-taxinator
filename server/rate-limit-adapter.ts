import type { FastifyRequest } from "fastify"
import {
  checkRateLimitByKey,
  createRateLimitHeaders,
  deriveClientKey,
  type RateLimitConfig,
  type RateLimitResult,
} from "@/lib/rate-limit"

function clientKeyFromFastify(req: FastifyRequest): string {
  const fwd = req.headers["x-forwarded-for"]
  const fwdFirst = Array.isArray(fwd) ? fwd[0] : fwd?.split(",")[0]
  const ip = (fwdFirst ?? req.headers["x-real-ip"] ?? req.ip ?? "unknown").toString().trim()
  const ua = (req.headers["user-agent"] ?? "unknown").toString()
  return deriveClientKey(ip, ua)
}

export function checkFastifyRateLimit(
  req: FastifyRequest,
  config: RateLimitConfig,
): RateLimitResult {
  return checkRateLimitByKey(clientKeyFromFastify(req), config)
}

export { createRateLimitHeaders }
