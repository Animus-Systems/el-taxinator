import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/pg", () => {
  const state = {
    rows: [] as Record<string, unknown>[],
    queries: [] as { text: string; values: unknown[] }[],
  }
  return {
    __state: state,
    getPool: async () => ({
      query: async (text: string, values: unknown[]) => {
        state.queries.push({ text, values })
        const next = state.rows
        state.rows = []
        return { rows: next, rowCount: next.length }
      },
    }),
  }
})

import * as pg from "@/lib/pg"
import {
  listFilings,
  getFiling,
  upsertFiling,
  clearFiling,
} from "@/models/tax-filings"

type TestState = {
  rows: Record<string, unknown>[]
  queries: { text: string; values: unknown[] }[]
}

function getState(): TestState {
  return (pg as unknown as { __state: TestState }).__state
}

function seedRows(rows: Record<string, unknown>[]) {
  getState().rows = rows
}

function lastQuery(): { text: string; values: unknown[] } {
  const queries = getState().queries
  const q = queries[queries.length - 1]
  if (!q) throw new Error("no queries were run")
  return q
}

const USER_ID = "00000000-0000-0000-0000-000000000001"

function filingRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "f1",
    user_id: USER_ID,
    year: 2025,
    quarter: 1,
    modelo_code: "130",
    filed_at: null,
    checklist: {},
    notes: null,
    created_at: new Date("2025-04-01T00:00:00.000Z"),
    updated_at: new Date("2025-04-01T00:00:00.000Z"),
    ...overrides,
  }
}

describe("models/tax-filings", () => {
  beforeEach(() => {
    getState().queries = []
    getState().rows = []
  })

  describe("listFilings", () => {
    it("returns parsed rows scoped by user and year, sorted (quarter NULLS LAST, modelo)", async () => {
      seedRows([
        filingRow({ id: "a", quarter: 1, modelo_code: "130" }),
        filingRow({ id: "b", quarter: 1, modelo_code: "303" }),
        filingRow({ id: "c", quarter: null, modelo_code: "100" }),
      ])
      const rows = await listFilings(USER_ID, 2025)
      expect(rows).toHaveLength(3)
      expect(rows[0]?.id).toBe("a")
      expect(rows[0]?.modeloCode).toBe("130")
      expect(rows[2]?.quarter).toBeNull()
      const q = lastQuery()
      expect(q.text).toMatch(/FROM tax_filings/)
      expect(q.text).toMatch(/WHERE user_id =/)
      expect(q.text).toMatch(/year =/)
      expect(q.text).toMatch(/ORDER BY quarter ASC NULLS LAST, modelo_code ASC/)
      expect(q.values).toContain(USER_ID)
      expect(q.values).toContain(2025)
    })
  })

  describe("getFiling", () => {
    it("returns null when no row matches", async () => {
      seedRows([])
      const row = await getFiling(USER_ID, 2025, 1, "130")
      expect(row).toBeNull()
      const q = lastQuery()
      expect(q.text).toMatch(/FROM tax_filings/)
      expect(q.text).toMatch(/user_id =/)
      expect(q.values).toContain(USER_ID)
      expect(q.values).toContain(2025)
      expect(q.values).toContain(1)
      expect(q.values).toContain("130")
    })

    it("uses IS NULL when quarter is null (annual filing)", async () => {
      seedRows([filingRow({ quarter: null, modelo_code: "100" })])
      const row = await getFiling(USER_ID, 2025, null, "100")
      expect(row?.modeloCode).toBe("100")
      expect(row?.quarter).toBeNull()
      const q = lastQuery()
      expect(q.text).toMatch(/quarter IS NULL/)
    })

    it("returns a parsed row when matched", async () => {
      seedRows([filingRow({ filed_at: new Date("2025-04-20T00:00:00.000Z") })])
      const row = await getFiling(USER_ID, 2025, 1, "130")
      expect(row).not.toBeNull()
      expect(row?.userId).toBe(USER_ID)
      expect(row?.filedAt).toBeInstanceOf(Date)
    })
  })

  describe("upsertFiling", () => {
    it("inserts when absent (ON CONFLICT DO UPDATE)", async () => {
      seedRows([
        filingRow({
          checklist: { step1: true },
          filed_at: new Date("2025-04-20T00:00:00.000Z"),
        }),
      ])
      const row = await upsertFiling(USER_ID, 2025, 1, "130", {
        filedAt: new Date("2025-04-20T00:00:00.000Z"),
        checklist: { step1: true },
      })
      expect(row.userId).toBe(USER_ID)
      expect(row.modeloCode).toBe("130")
      const q = lastQuery()
      expect(q.text).toMatch(/INSERT INTO tax_filings/)
      expect(q.text).toMatch(/ON CONFLICT/)
      expect(q.text).toMatch(/DO UPDATE SET/)
      expect(q.values).toContain(USER_ID)
      expect(q.values).toContain(2025)
      expect(q.values).toContain(1)
      expect(q.values).toContain("130")
    })

    it("updates provided fields when present and leaves others", async () => {
      seedRows([filingRow({ notes: "updated note" })])
      const row = await upsertFiling(USER_ID, 2025, 1, "130", {
        notes: "updated note",
      })
      expect(row.notes).toBe("updated note")
      const q = lastQuery()
      expect(q.text).toMatch(/INSERT INTO tax_filings/)
      expect(q.text).toMatch(/ON CONFLICT/)
      // notes is in the SET clause
      expect(q.text).toMatch(/notes = EXCLUDED\.notes/)
    })

    it("handles null quarter (annual filing)", async () => {
      seedRows([filingRow({ quarter: null, modelo_code: "100" })])
      const row = await upsertFiling(USER_ID, 2025, null, "100", {
        checklist: { done: true },
      })
      expect(row.quarter).toBeNull()
      const q = lastQuery()
      expect(q.text).toMatch(/INSERT INTO tax_filings/)
      // quarter passed in as null
      expect(q.values).toContain(null)
    })

    it("persists past-filing fields (amount, confirmation, source) in the SET clause", async () => {
      seedRows([
        filingRow({
          filed_at: new Date("2024-07-18T12:00:00.000Z"),
          filed_amount_cents: 80000,
          confirmation_number: "ABC123XYZ",
          filing_source: "external",
        }),
      ])
      const row = await upsertFiling(USER_ID, 2024, 2, "130", {
        filedAt: new Date("2024-07-18T12:00:00.000Z"),
        filedAmountCents: 80000,
        confirmationNumber: "ABC123XYZ",
        filingSource: "external",
      })
      expect(row.filedAmountCents).toBe(80000)
      expect(row.confirmationNumber).toBe("ABC123XYZ")
      expect(row.filingSource).toBe("external")
      const q = lastQuery()
      expect(q.text).toMatch(/filed_amount_cents = EXCLUDED\.filed_amount_cents/)
      expect(q.text).toMatch(/confirmation_number = EXCLUDED\.confirmation_number/)
      expect(q.text).toMatch(/filing_source = EXCLUDED\.filing_source/)
      expect(q.values).toContain(80000)
      expect(q.values).toContain("ABC123XYZ")
      expect(q.values).toContain("external")
    })

    it("omits past-filing SET clauses when fields are not in the patch (preserves existing values)", async () => {
      seedRows([filingRow({ filed_at: null })])
      // Simulate the existing "mark as unfiled" toggle: only filedAt in the patch.
      await upsertFiling(USER_ID, 2024, 2, "130", { filedAt: null })
      const q = lastQuery()
      expect(q.text).toMatch(/filed_at = EXCLUDED\.filed_at/)
      expect(q.text).not.toMatch(/filed_amount_cents = EXCLUDED/)
      expect(q.text).not.toMatch(/confirmation_number = EXCLUDED/)
      expect(q.text).not.toMatch(/filing_source = EXCLUDED/)
    })
  })

  describe("clearFiling", () => {
    it("issues DELETE with user+year+quarter+modelo scope", async () => {
      seedRows([])
      await clearFiling(USER_ID, 2025, 1, "130")
      const q = lastQuery()
      expect(q.text).toMatch(/DELETE FROM tax_filings/)
      expect(q.text).toMatch(/user_id =/)
      expect(q.text).toMatch(/year =/)
      expect(q.text).toMatch(/modelo_code =/)
      expect(q.values).toContain(USER_ID)
      expect(q.values).toContain(2025)
      expect(q.values).toContain(1)
      expect(q.values).toContain("130")
    })

    it("uses IS NULL when quarter is null (annual filing)", async () => {
      seedRows([])
      await clearFiling(USER_ID, 2025, null, "100")
      const q = lastQuery()
      expect(q.text).toMatch(/DELETE FROM tax_filings/)
      expect(q.text).toMatch(/quarter IS NULL/)
      expect(q.values).toContain("100")
    })
  })
})
