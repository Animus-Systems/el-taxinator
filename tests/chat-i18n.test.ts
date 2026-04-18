import { describe, it, expect } from "vitest"
import en from "@/messages/en.json"
import es from "@/messages/es.json"

describe("chat translations", () => {
  const requiredKeys = [
    "chat.title",
    "chat.placeholder",
    "chat.send",
    "chat.clearHistory",
    "chat.clearConfirmTitle",
    "chat.clearConfirmBody",
    "chat.retry",
    "chat.applied",
    "chat.dismissed",
    "chat.apply",
    "chat.dismiss",
    "chat.noProviderTitle",
    "chat.noProviderBody",
    "chat.noProviderCta",
    "chat.proposalRuleTitle",
    "chat.proposalUpdateTitle",
    "chat.actions.applyRuleToExistingTitle",
    "chat.actions.bulkUpdateTitle",
    "chat.actions.createCategoryTitle",
    "chat.actions.createProjectTitle",
    "chat.actions.deleteTransactionTitle",
    "chat.actions.deleteRuleTitle",
    "chat.actions.pairTransfersBulkTitle",
    "chat.actions.pairTransfersBulkDescription",
    "chat.actions.pairTransfersBulkApplied",
    "chat.actions.willAffectCount",
    "chat.actions.confirmBulkBody",
    "chat.actions.confirmDeleteTransactionBody",
    "chat.actions.confirmDeleteRuleBody",
    "chat.actions.tooManyMatches",
  ]

  function get(obj: Record<string, unknown>, path: string): unknown {
    return path.split(".").reduce<unknown>(
      (acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined),
      obj,
    )
  }

  for (const key of requiredKeys) {
    it(`has "${key}" in en.json`, () => {
      expect(typeof get(en as Record<string, unknown>, key)).toBe("string")
    })
    it(`has "${key}" in es.json`, () => {
      expect(typeof get(es as Record<string, unknown>, key)).toBe("string")
    })
  }
})
