import { describe, it, expect } from "vitest"
import { buildMultiRowInsert } from "@/lib/sql"

describe("buildMultiRowInsert", () => {
  it("builds a multi-row insert with snake_case columns", () => {
    const q = buildMultiRowInsert("items", [
      { id: "a", docId: "d", position: 1, unitPrice: 100 },
      { id: "b", docId: "d", position: 2, unitPrice: 200 },
    ])
    expect(q.text).toBe(
      "INSERT INTO items (id, doc_id, position, unit_price) VALUES ($1, $2, $3, $4), ($5, $6, $7, $8) RETURNING *",
    )
    expect(q.values).toEqual(["a", "d", 1, 100, "b", "d", 2, 200])
    expect(q.rowCount).toBe(2)
  })

  it("auto-generates UUIDs when id is missing", () => {
    const q = buildMultiRowInsert("items", [
      { docId: "d", position: 1 },
      { docId: "d", position: 2 },
    ])
    expect(q.text.startsWith("INSERT INTO items (id, doc_id, position)")).toBe(true)
    expect(String(q.values[0])).toHaveLength(36)
    expect(String(q.values[3])).toHaveLength(36)
    expect(q.values[0]).not.toBe(q.values[3])
  })

  it("throws when rows have mismatched columns", () => {
    expect(() =>
      buildMultiRowInsert("items", [
        { id: "a", docId: "d", position: 1 },
        { id: "b", docId: "d" },
      ]),
    ).toThrow(/missing column 'position'/)
  })

  it("throws on empty input", () => {
    expect(() => buildMultiRowInsert("items", [])).toThrow(/non-empty/)
  })
})
