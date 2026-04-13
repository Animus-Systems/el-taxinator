import { describe, expect, it, vi } from "vitest"
import {
  cn,
  formatCurrency,
  formatBytes,
  formatNumber,
  codeFromName,
  folderNameFromName,
  encodeFilename,
  generateUUID,
  formatPeriodLabel,
} from "@/lib/utils"
import {
  sanitizeError,
  sanitizeValidationError,
  createSanitizedErrorResponse,
} from "@/lib/error-sanitizer"
import { createRateLimitHeaders } from "@/lib/rate-limit"
import {
  safePathJoin,
  unsortedFilePath,
  previewFilePath,
} from "@/lib/files"

describe("cn (className merge)", () => {
  it("merges basic class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar")
  })

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible")
  })

  it("merges tailwind conflicts correctly", () => {
    const result = cn("p-4", "p-2")
    expect(result).toBe("p-2")
  })

  it("handles empty inputs", () => {
    expect(cn()).toBe("")
  })

  it("handles undefined and null inputs", () => {
    expect(cn("foo", undefined, null, "bar")).toBe("foo bar")
  })
})

describe("formatCurrency", () => {
  it("formats USD amount from cents", () => {
    const result = formatCurrency(12345, "USD")
    expect(result).toBe("$123.45")
  })

  it("formats EUR amount from cents", () => {
    const result = formatCurrency(10000, "EUR")
    // Intl may format EUR with symbol
    expect(result).toContain("100.00")
  })

  it("formats zero amount", () => {
    const result = formatCurrency(0, "USD")
    expect(result).toBe("$0.00")
  })

  it("formats negative amounts", () => {
    const result = formatCurrency(-5000, "USD")
    expect(result).toContain("50.00")
  })

  it("handles large amounts with grouping", () => {
    const result = formatCurrency(12345678, "USD")
    expect(result).toContain("123,456.78")
  })

  it("falls back for unknown/custom currency codes", () => {
    const result = formatCurrency(10000, "DOGE")
    expect(result).toContain("DOGE")
    expect(result).toContain("100")
  })
})

describe("formatBytes", () => {
  it("formats 0 bytes", () => {
    expect(formatBytes(0)).toBe("0 Bytes")
  })

  it("formats bytes", () => {
    expect(formatBytes(500)).toBe("500 Bytes")
  })

  it("formats kilobytes", () => {
    expect(formatBytes(1024)).toBe("1 KB")
  })

  it("formats megabytes", () => {
    expect(formatBytes(1048576)).toBe("1 MB")
  })

  it("formats gigabytes", () => {
    expect(formatBytes(1073741824)).toBe("1 GB")
  })

  it("formats fractional KB", () => {
    const result = formatBytes(1536) // 1.5 KB
    expect(result).toBe("1.5 KB")
  })

  it("caps at GB for very large values", () => {
    const result = formatBytes(1099511627776) // 1 TB
    expect(result).toContain("GB")
  })
})

describe("formatNumber", () => {
  it("formats simple numbers", () => {
    expect(formatNumber(42)).toBe("42")
  })

  it("formats large numbers with grouping", () => {
    expect(formatNumber(1000000)).toBe("1,000,000")
  })

  it("formats zero", () => {
    expect(formatNumber(0)).toBe("0")
  })

  it("formats negative numbers", () => {
    const result = formatNumber(-1234)
    expect(result).toContain("1,234")
  })
})

describe("codeFromName", () => {
  it("converts name to lowercase slug", () => {
    expect(codeFromName("My Project")).toBe("my_project")
  })

  it("handles special characters", () => {
    expect(codeFromName("Hello World!")).toBe("hello_world")
  })

  it("truncates to maxLength", () => {
    const result = codeFromName("This Is A Very Long Name", 10)
    expect(result.length).toBeLessThanOrEqual(10)
  })

  it("defaults to maxLength of 32", () => {
    const result = codeFromName("A Really Really Really Long Name That Exceeds Limit")
    expect(result.length).toBeLessThanOrEqual(32)
  })

  it("handles empty string", () => {
    expect(codeFromName("")).toBe("")
  })

  it("strips accented characters", () => {
    const result = codeFromName("Cafe Expres")
    expect(result).toBe("cafe_expres")
  })
})

describe("folderNameFromName", () => {
  it("converts name to lowercase slug", () => {
    expect(folderNameFromName("My Project")).toBe("my-project")
  })

  it("defaults to maxLength of 32", () => {
    const result = folderNameFromName("A Really Really Really Long Name That Exceeds Limit")
    expect(result.length).toBeLessThanOrEqual(32)
  })
})

describe("encodeFilename", () => {
  it("encodes a simple filename", () => {
    expect(encodeFilename("file.pdf")).toBe("UTF-8''file.pdf")
  })

  it("encodes spaces in filenames", () => {
    const result = encodeFilename("my document.pdf")
    expect(result).toContain("UTF-8''")
    expect(result).toContain("my%20document.pdf")
  })

  it("encodes special characters", () => {
    const result = encodeFilename("report (2026).pdf")
    expect(result).toBe("UTF-8''report%20(2026).pdf")
  })
})

describe("generateUUID", () => {
  it("returns a string in UUID format", () => {
    const uuid = generateUUID()
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    expect(uuid).toMatch(uuidRegex)
  })

  it("generates unique UUIDs", () => {
    const uuids = new Set(Array.from({ length: 100 }, () => generateUUID()))
    expect(uuids.size).toBe(100)
  })

  it("UUID contains version 4 marker", () => {
    const uuid = generateUUID()
    // 13th char should be '4' for UUID v4
    expect(uuid[14]).toBe("4")
  })
})

describe("formatPeriodLabel", () => {
  it("formats daily period with day/month/year", () => {
    const result = formatPeriodLabel("2026-03-15", new Date(2026, 2, 15))
    expect(result).toContain("Mar")
    expect(result).toContain("15")
    expect(result).toContain("2026")
  })

  it("formats monthly period with month/year", () => {
    const result = formatPeriodLabel("2026-03", new Date(2026, 2, 1))
    expect(result).toContain("Mar")
    expect(result).toContain("2026")
  })

  it("daily format includes weekday", () => {
    const result = formatPeriodLabel("2026-03-15", new Date(2026, 2, 15))
    // March 15, 2026 is a Sunday
    expect(result).toContain("Sun")
  })
})

describe("safePathJoin", () => {
  it("joins paths inside base directory", () => {
    expect(safePathJoin("/tmp/uploads", "2026", "03", "file.pdf")).toBe(
      "/tmp/uploads/2026/03/file.pdf"
    )
  })

  it("rejects path traversal with ..", () => {
    expect(() => safePathJoin("/tmp/uploads", "../secrets.txt")).toThrow(
      "Path traversal detected"
    )
  })

  it("handles single subpath", () => {
    expect(safePathJoin("/base", "file.txt")).toBe("/base/file.txt")
  })
})

describe("unsortedFilePath", () => {
  it("returns path in unsorted directory with correct extension", () => {
    const result = unsortedFilePath("abc-123", "receipt.pdf")
    expect(result).toBe("unsorted/abc-123.pdf")
  })

  it("handles filenames with multiple dots", () => {
    const result = unsortedFilePath("uuid-1", "my.file.name.jpg")
    expect(result).toBe("unsorted/uuid-1.jpg")
  })
})

describe("previewFilePath", () => {
  it("returns path for preview with page number", () => {
    const result = previewFilePath("abc-123", 0)
    expect(result).toBe("previews/abc-123.0.webp")
  })

  it("handles different page numbers", () => {
    const result = previewFilePath("abc-123", 5)
    expect(result).toBe("previews/abc-123.5.webp")
  })
})

describe("sanitizeError", () => {
  it("sanitizes Prisma errors", () => {
    const result = sanitizeError(new Error("Prisma: connection failed"))
    expect(result).toBe("A database error occurred. Please try again later.")
    expect(result).not.toContain("Prisma")
  })

  it("sanitizes duplicate key errors", () => {
    const result = sanitizeError(new Error("duplicate key value"))
    expect(result).toBe("A duplicate entry was detected. Please check your data.")
  })

  it("sanitizes connection refused errors", () => {
    const result = sanitizeError("connection refused to postgres:5432")
    expect(result).toBe("Unable to connect to the database. Please try again later.")
  })

  it("sanitizes JWT errors", () => {
    const result = sanitizeError(new Error("jwt invalid signature"))
    expect(result).toBe("Authentication failed. Please log in again.")
  })

  it("sanitizes file not found errors", () => {
    const result = sanitizeError(new Error("ENOENT: no such file or directory"))
    expect(result).toBe("The requested file could not be found.")
  })

  it("sanitizes permission errors", () => {
    const result = sanitizeError(new Error("EACCES: permission denied"))
    expect(result).toBe("Permission denied. Please check your access rights.")
  })

  it("sanitizes Stripe errors", () => {
    const result = sanitizeError(new Error("Stripe error: invalid API key"))
    expect(result).toBe("Payment processing error. Please try again or contact support.")
  })

  it("sanitizes OpenAI errors", () => {
    const result = sanitizeError(new Error("openai error rate limit exceeded"))
    expect(result).toBe("AI service temporarily unavailable. Please try again later.")
  })

  it("returns generic message for unknown errors", () => {
    const result = sanitizeError(new Error("something weird happened"))
    expect(result).toBe("An unexpected error occurred. Please try again later.")
  })

  it("handles null error", () => {
    const result = sanitizeError(null)
    expect(result).toBe("An unexpected error occurred. Please try again later.")
  })

  it("handles undefined error", () => {
    const result = sanitizeError(undefined)
    expect(result).toBe("An unexpected error occurred. Please try again later.")
  })

  it("uses category fallback for known category", () => {
    const result = sanitizeError(new Error("some generic error"), "database")
    expect(result).toBe("A database error occurred. Please try again later.")
  })

  it("handles string errors", () => {
    const result = sanitizeError("token expired unexpectedly")
    expect(result).toBe("Your session has expired. Please log in again.")
  })
})

describe("sanitizeValidationError", () => {
  it("handles null input", () => {
    const result = sanitizeValidationError(null)
    expect(result).toBe("Invalid input provided. Please check your data.")
  })

  it("handles Zod-like error structure", () => {
    const zodError = {
      errors: [
        { path: ["email"], message: "Invalid email" },
        { path: ["name"], message: "Required" },
      ],
    }
    const result = sanitizeValidationError(zodError)
    expect(result).toContain("email: Invalid email")
    expect(result).toContain("name: Required")
  })

  it("masks sensitive field names", () => {
    const zodError = {
      errors: [{ path: ["password"], message: "Too short" }],
    }
    const result = sanitizeValidationError(zodError)
    expect(result).toContain("Invalid input in sensitive field")
    expect(result).not.toContain("Too short")
  })

  it("limits to first 3 errors", () => {
    const zodError = {
      errors: [
        { path: ["a"], message: "err1" },
        { path: ["b"], message: "err2" },
        { path: ["c"], message: "err3" },
        { path: ["d"], message: "err4" },
      ],
    }
    const result = sanitizeValidationError(zodError)
    expect(result).not.toContain("err4")
  })
})

describe("createSanitizedErrorResponse", () => {
  it("returns a Response object with correct status", async () => {
    const response = createSanitizedErrorResponse(new Error("prisma failed"), 500)
    expect(response).toBeInstanceOf(Response)
    expect(response.status).toBe(500)
  })

  it("returns JSON content type", async () => {
    const response = createSanitizedErrorResponse(new Error("test"), 400)
    expect(response.headers.get("Content-Type")).toBe("application/json")
  })

  it("body contains sanitized error message", async () => {
    const response = createSanitizedErrorResponse(new Error("prisma error"), 500)
    const body = await response.json()
    expect(body.error).toBe("A database error occurred. Please try again later.")
  })

  it("uses custom status code", async () => {
    const response = createSanitizedErrorResponse("test", 403)
    expect(response.status).toBe(403)
  })
})
