/**
 * Error Message Sanitizer
 * 
 * Prevents sensitive information leakage in API error responses by:
 * - Filtering internal error details from error messages
 * - Providing safe, user-friendly error messages
 * - Logging full error details server-side for debugging
 */

/**
 * Tuple of [pattern, safeMessage] for internal error sanitization
 * These patterns should NEVER be exposed to clients
 */
const SENSITIVE_ERROR_PATTERNS: [RegExp | string, string][] = [
  // Database errors
  [/prisma/i, "A database error occurred. Please try again later."],
  [/duplicate key/i, "A duplicate entry was detected. Please check your data."],
  [/foreign key constraint/i, "This operation violates data integrity constraints."],
  [/connection refused/i, "Unable to connect to the database. Please try again later."],
  [/connection timeout/i, "Database connection timed out. Please try again."],

  // Authentication errors
  [/invalid credentials/i, "Invalid email or password."],
  [/token.*expired/i, "Your session has expired. Please log in again."],
  [/jwt.*invalid/i, "Authentication failed. Please log in again."],
  [/cookie.*invalid/i, "Session validation failed. Please log in again."],

  // File system errors
  [/enoent/i, "The requested file could not be found."],
  [/eacces/i, "Permission denied. Please check your access rights."],
  [/enospc/i, "Not enough storage space available."],
  [/emfile/i, "Too many open files. Please try again later."],

  // Configuration errors
  [/config.*missing/i, "Configuration error. Please contact support."],
  [/env.*missing/i, "Environment configuration error. Please contact support."],
  [/secret.*not.*set/i, "Application configuration incomplete. Please contact support."],

  // External service errors
  [/stripe.*error/i, "Payment processing error. Please try again or contact support."],
  [/resend.*error/i, "Email service error. Please try again later."],
  [/openai.*error/i, "AI service temporarily unavailable. Please try again later."],
]

/**
 * Generic fallback messages for different error categories
 */
const GENERIC_MESSAGES: Record<string, string> = {
  validation: "Invalid input provided. Please check your data.",
  auth: "Authentication required. Please log in.",
  database: "A database error occurred. Please try again later.",
  network: "Network error. Please check your connection.",
  file: "File processing error. Please try again.",
  unknown: "An unexpected error occurred. Please try again later.",
}

/**
 * Sanitizes an error object/message for safe API response
 * 
 * @param error - The error object or string to sanitize
 * @param category - Optional category hint for better generic messages
 * @returns Safe error message suitable for API response
 * 
 * @example
 * // Input: new Error("prisma: connection refused to database")
 * // Output: "A database error occurred. Please try again later."
 */
export function sanitizeError(error: unknown, category?: string): string {
  // Handle null/undefined
  if (error == null) {
    return GENERIC_MESSAGES.unknown
  }

  // Get the error message as string
  let errorMessage: string
  if (error instanceof Error) {
    errorMessage = error.message
  } else if (typeof error === "string") {
    errorMessage = error
  } else {
    errorMessage = JSON.stringify(error)
  }

  // Check against sensitive patterns
  for (const [pattern, safeMessage] of SENSITIVE_ERROR_PATTERNS) {
    const regex = typeof pattern === "string" && pattern.startsWith("/") && pattern.endsWith("/")
      ? new RegExp(pattern.slice(1, -1), "i")
      : new RegExp(pattern, "i")
    
    if (regex.test(errorMessage)) {
      // Log the full error for debugging (server-side only)
      if (error instanceof Error) {
        logErrorForDebug(error, category)
      }
      return safeMessage
    }
  }

  // If no sensitive pattern matched, return a generic message based on category
  if (category && GENERIC_MESSAGES[category]) {
    // Still log the full error
    if (error instanceof Error) {
      logErrorForDebug(error, category)
    }
    return GENERIC_MESSAGES[category]
  }

  // For truly unknown errors, return generic message
  // Log full details for debugging
  if (error instanceof Error) {
    logErrorForDebug(error, category)
  }

  return GENERIC_MESSAGES.unknown
}

/**
 * Sanitizes validation errors from Zod or similar libraries
 * Returns only field-level messages without exposing internals
 */
export function sanitizeValidationError(error: unknown): string {
  if (error == null) {
    return GENERIC_MESSAGES.validation
  }

  // Handle ZodError-like structures
  if (typeof error === "object" && error !== null) {
    const err = error as Record<string, unknown>
    
    // Check for Zod error format
    if (Array.isArray(err.errors)) {
      const messages = err.errors
        .slice(0, 3) // Limit to first 3 errors to prevent info leakage
        .map((e: Record<string, unknown>) => {
          const path = Array.isArray(e.path) ? e.path.join(".") : String(e.path)
          const message = String(e.message || "Invalid value")
          // Don't expose field names if they contain sensitive patterns
          if (path.includes("password") || path.includes("token") || path.includes("secret")) {
            return "Invalid input in sensitive field"
          }
          return `${path}: ${message}`
        })
      return messages.join("; ")
    }

    // Check for generic message property
    if (typeof err.message === "string") {
      return sanitizeError(err.message, "validation")
    }
  }

  return sanitizeError(error, "validation")
}

/**
 * Creates a sanitized error response object for API routes
 */
export function createSanitizedErrorResponse(
  error: unknown,
  statusCode: number = 500,
  category?: string
): Response {
  const message = sanitizeError(error, category)
  
  return new Response(JSON.stringify({ error: message }), {
    status: statusCode,
    headers: { "Content-Type": "application/json" },
  })
}

/**
 * Logs error details server-side for debugging
 * Only called internally - never exposes details to client
 */
function logErrorForDebug(error: Error | unknown, category?: string): void {
  const timestamp = new Date().toISOString()
  const errorDetails = {
    timestamp,
    category,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  }
  
  // In production, this would go to a proper logging service
  // For now, console.error with structured format
  console.error("[SANITIZED_ERROR]", JSON.stringify(errorDetails, null, 2))
}

/**
 * Helper to wrap async route handlers with automatic error sanitization
 */
export function withSanitizedErrors<T extends (...args: Parameters<T>) => Promise<Response>>(
  handler: T,
  category?: string
): T {
  return (async (...args: Parameters<T>): Promise<Response> => {
    try {
      return await handler(...args)
    } catch (error) {
      console.error("Unhandled error in route handler:", error)
      return createSanitizedErrorResponse(error, 500, category)
    }
  }) as T
}
