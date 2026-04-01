import { describe, expect, it } from "vitest"
import en from "@/messages/en.json"
import es from "@/messages/es.json"

/** Recursively extract all keys from a nested object as dot-separated paths */
function getKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = []
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    const value = obj[key]
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...getKeys(value as Record<string, unknown>, fullKey))
    } else {
      keys.push(fullKey)
    }
  }
  return keys.sort()
}

/** Recursively extract all leaf string values from a nested object */
function getValues(obj: Record<string, unknown>, prefix = ""): { key: string; value: string }[] {
  const entries: { key: string; value: string }[] = []
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    const value = obj[key]
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      entries.push(...getValues(value as Record<string, unknown>, fullKey))
    } else if (typeof value === "string") {
      entries.push({ key: fullKey, value })
    }
  }
  return entries
}

/** Get top-level namespaces from a translation object */
function getNamespaces(obj: Record<string, unknown>): string[] {
  return Object.keys(obj).sort()
}

describe("Translation key structure", () => {
  const enKeys = getKeys(en as Record<string, unknown>)
  const esKeys = getKeys(es as Record<string, unknown>)

  it("en.json and es.json have identical key structures", () => {
    expect(enKeys).toEqual(esKeys)
  })

  it("en.json has keys present", () => {
    expect(enKeys.length).toBeGreaterThan(0)
  })

  it("es.json has keys present", () => {
    expect(esKeys.length).toBeGreaterThan(0)
  })

  it("both files have the same number of keys", () => {
    expect(enKeys.length).toBe(esKeys.length)
  })

  it("keys in en.json that are missing from es.json", () => {
    const missingInEs = enKeys.filter((k) => !esKeys.includes(k))
    expect(missingInEs).toEqual([])
  })

  it("keys in es.json that are missing from en.json", () => {
    const missingInEn = esKeys.filter((k) => !enKeys.includes(k))
    expect(missingInEn).toEqual([])
  })
})

describe("Translation value integrity", () => {
  it("no empty string values in en.json", () => {
    const values = getValues(en as Record<string, unknown>)
    const empties = values.filter((v) => v.value === "")
    expect(empties.map((v) => v.key)).toEqual([])
  })

  it("no empty string values in es.json", () => {
    const values = getValues(es as Record<string, unknown>)
    const empties = values.filter((v) => v.value === "")
    expect(empties.map((v) => v.key)).toEqual([])
  })
})

describe("Spanish translation quality", () => {
  // Common English words that should generally not appear in Spanish translations
  // We exclude proper nouns and technical terms
  const commonEnglishWords = [
    "the",
    "your",
    "please",
    "click here",
    "submit",
    "welcome to",
  ]

  it("es.json values do not contain common English phrases", () => {
    const esValues = getValues(es as Record<string, unknown>)
    const suspiciousEntries: { key: string; value: string; match: string }[] = []

    for (const entry of esValues) {
      const lowerValue = entry.value.toLowerCase()
      for (const word of commonEnglishWords) {
        // Use word boundary matching to avoid false positives
        const regex = new RegExp(`\\b${word}\\b`, "i")
        if (regex.test(lowerValue)) {
          suspiciousEntries.push({ ...entry, match: word })
        }
      }
    }

    expect(suspiciousEntries).toEqual([])
  })
})

describe("Translation namespaces", () => {
  it("both files have identical top-level namespaces", () => {
    const enNs = getNamespaces(en as Record<string, unknown>)
    const esNs = getNamespaces(es as Record<string, unknown>)
    expect(enNs).toEqual(esNs)
  })

  it("expected namespaces exist in en.json", () => {
    const enNs = getNamespaces(en as Record<string, unknown>)
    const expected = ["app", "nav", "auth", "dashboard", "settings", "common"]
    for (const ns of expected) {
      expect(enNs).toContain(ns)
    }
  })

  it("expected namespaces exist in es.json", () => {
    const esNs = getNamespaces(es as Record<string, unknown>)
    const expected = ["app", "nav", "auth", "dashboard", "settings", "common"]
    for (const ns of expected) {
      expect(esNs).toContain(ns)
    }
  })
})
