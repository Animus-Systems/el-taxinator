import { describe, expect, it } from "vitest"
import { routing } from "@/routing"
import { locales, defaultLocale, type Locale } from "@/i18n"

describe("Routing config", () => {
  it("has correct locales", () => {
    expect(routing.locales).toEqual(["en", "es"])
  })

  it("has 'en' as default locale", () => {
    expect(routing.defaultLocale).toBe("en")
  })

  it("uses 'as-needed' locale prefix", () => {
    expect(routing.localePrefix).toBe("as-needed")
  })

  it("includes at least 2 locales", () => {
    expect(routing.locales.length).toBeGreaterThanOrEqual(2)
  })
})

describe("i18n config exports", () => {
  it("re-exports locales from routing", () => {
    expect(locales).toEqual(["en", "es"])
  })

  it("re-exports defaultLocale from routing", () => {
    expect(defaultLocale).toBe("en")
  })

  it("Locale type allows 'en'", () => {
    const locale: Locale = "en"
    expect(locales.includes(locale)).toBe(true)
  })

  it("Locale type allows 'es'", () => {
    const locale: Locale = "es"
    expect(locales.includes(locale)).toBe(true)
  })

  it("validates that a locale string is included in the locales array", () => {
    expect(locales.includes("en" as Locale)).toBe(true)
    expect(locales.includes("es" as Locale)).toBe(true)
  })

  it("invalid locale is not in locales array", () => {
    expect(locales.includes("fr" as Locale)).toBe(false)
    expect(locales.includes("de" as Locale)).toBe(false)
    expect(locales.includes("" as Locale)).toBe(false)
  })
})
