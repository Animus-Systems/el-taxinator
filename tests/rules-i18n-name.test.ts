import { describe, expect, it } from "vitest"

import { buildI18nRuleName } from "@/lib/rules-i18n-name"
import { getLocalizedValue } from "@/lib/i18n-db"

describe("buildI18nRuleName", () => {
  it("produces a JSON string resolvable by getLocalizedValue for plain params", () => {
    const encoded = buildI18nRuleName("ruleNameForCategory", {
      category: "Software",
      value: "AWS",
    })

    expect(getLocalizedValue(encoded, "en")).toBe('Software for "AWS"')
    expect(getLocalizedValue(encoded, "es")).toBe('Software para "AWS"')
  })

  it("resolves per-locale when a param is an i18n object", () => {
    const encoded = buildI18nRuleName("ruleNameForCategory", {
      category: { en: "Software", es: "Programas" },
      value: "AWS",
    })

    expect(getLocalizedValue(encoded, "en")).toBe('Software for "AWS"')
    expect(getLocalizedValue(encoded, "es")).toBe('Programas para "AWS"')
  })

  it("handles the learnedPrefix template", () => {
    const encoded = buildI18nRuleName("ruleLearnedPrefix", {
      pattern: "Starbucks",
    })

    expect(getLocalizedValue(encoded, "en")).toBe("Learned: Starbucks")
    expect(getLocalizedValue(encoded, "es")).toBe("Aprendido: Starbucks")
  })

  it("falls back to empty when a param is missing", () => {
    const encoded = buildI18nRuleName("ruleNameForCategory", {
      category: "Software",
      // value omitted
    })

    expect(getLocalizedValue(encoded, "en")).toBe('Software for ""')
  })
})
