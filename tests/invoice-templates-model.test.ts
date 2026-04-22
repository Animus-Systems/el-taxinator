import { describe, it, expect, vi, beforeEach } from "vitest"

type FakeQuery = { text: string; values: unknown[] }

vi.mock("@/lib/pg", () => {
  const state = {
    // Queue of rowsets, dequeued in order per query. A query skips dequeue
    // for BEGIN/COMMIT/ROLLBACK so transactional tests can stage only the
    // statements they care about.
    queue: [] as Record<string, unknown>[][],
    queries: [] as FakeQuery[],
    txQueries: [] as FakeQuery[],
  }
  const isControl = (text: string) => /^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(text)
  const dequeue = (): Record<string, unknown>[] => state.queue.shift() ?? []
  return {
    __state: state,
    getPool: async () => ({
      query: async (text: string, values: unknown[] = []) => {
        state.queries.push({ text, values })
        const rows = isControl(text) ? [] : dequeue()
        return { rows, rowCount: rows.length }
      },
      connect: async () => ({
        query: async (text: string, values: unknown[] = []) => {
          state.txQueries.push({ text, values })
          const rows = isControl(text) ? [] : dequeue()
          return { rows, rowCount: rows.length }
        },
        release: () => undefined,
      }),
    }),
  }
})

import * as pg from "@/lib/pg"
import {
  listTemplates,
  getTemplateById,
  createTemplate,
  deleteTemplate,
  setDefaultTemplate,
} from "@/models/invoice-templates"

type State = {
  queue: Record<string, unknown>[][]
  queries: FakeQuery[]
  txQueries: FakeQuery[]
}
function getState(): State {
  return (pg as unknown as { __state: State }).__state
}
function enqueueRows(...rowsets: Record<string, unknown>[][]) {
  getState().queue.push(...rowsets)
}
function lastQuery(): FakeQuery {
  const q = getState().queries
  const last = q[q.length - 1]
  if (!last) throw new Error("No queries recorded")
  return last
}
function txQueries(): FakeQuery[] {
  return getState().txQueries
}

const USER_ID = "00000000-0000-0000-0000-000000000001"
const TEMPLATE_ID = "00000000-0000-0000-0000-000000000abc"

function templateRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: TEMPLATE_ID,
    user_id: USER_ID,
    name: "Default",
    is_default: true,
    logo_file_id: null,
    logo_position: "left",
    accent_color: "#4f46e5",
    font_preset: "helvetica",
    header_text: null,
    footer_text: null,
    bank_details_text: null,
    show_bank_details: false,
    payment_terms_days: null,
    language: "es",
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  }
}

describe("models/invoice-templates", () => {
  beforeEach(() => {
    const state = getState()
    state.queue = []
    state.queries = []
    state.txQueries = []
  })

  it("listTemplates scopes by user_id and orders by name", async () => {
    enqueueRows([])
    await listTemplates(USER_ID)
    expect(lastQuery().text).toMatch(/FROM invoice_templates/)
    expect(lastQuery().text).toMatch(/WHERE user_id =/)
    expect(lastQuery().text).toMatch(/ORDER BY name/)
    expect(lastQuery().values).toContain(USER_ID)
  })

  it("getTemplateById scopes by both id and user_id", async () => {
    enqueueRows([templateRow()])
    const t = await getTemplateById(TEMPLATE_ID, USER_ID)
    expect(t?.id).toBe(TEMPLATE_ID)
    expect(lastQuery().text).toMatch(/WHERE id =.+AND user_id =/)
    expect(lastQuery().values).toEqual(expect.arrayContaining([TEMPLATE_ID, USER_ID]))
  })

  it("createTemplate inserts with user_id embedded", async () => {
    // Single INSERT inside a tx (no isDefault flip). BEGIN/COMMIT are
    // no-ops in the mock so we only queue the INSERT result.
    enqueueRows([templateRow({ name: "New" })])
    const created = await createTemplate(USER_ID, { name: "New" })
    expect(created.name).toBe("New")
    const insertQ = txQueries().find((q) => /INSERT INTO invoice_templates/.test(q.text))
    expect(insertQ).toBeTruthy()
    expect(insertQ?.values).toContain(USER_ID)
  })

  it("deleteTemplate scopes by id and user_id", async () => {
    enqueueRows([templateRow()])
    await deleteTemplate(TEMPLATE_ID, USER_ID)
    expect(lastQuery().text).toMatch(/DELETE FROM invoice_templates/)
    expect(lastQuery().text).toMatch(/id =.+AND user_id =/)
    expect(lastQuery().values).toEqual(expect.arrayContaining([TEMPLATE_ID, USER_ID]))
  })

  it("setDefaultTemplate unsets existing default then sets the new one inside a transaction", async () => {
    // Queue two rowsets: first for the unset UPDATE (no rows needed), second
    // for the set UPDATE returning the newly-default row.
    enqueueRows([], [templateRow({ is_default: true })])
    await setDefaultTemplate(TEMPLATE_ID, USER_ID)

    const tx = txQueries()
    const texts = tx.map((q) => q.text)
    // BEGIN, unset all, set target, COMMIT — order matters so the partial
    // unique index is never violated mid-transaction.
    expect(texts[0]).toMatch(/BEGIN/)
    const unsetIdx = texts.findIndex((t) =>
      /UPDATE invoice_templates\s+SET\s+is_default\s*=\s*false/i.test(t),
    )
    const setIdx = texts.findIndex((t) =>
      /UPDATE invoice_templates\s+SET\s+is_default\s*=\s*true/i.test(t),
    )
    expect(unsetIdx).toBeGreaterThanOrEqual(0)
    expect(setIdx).toBeGreaterThan(unsetIdx)
    expect(texts[texts.length - 1]).toMatch(/COMMIT/)
  })
})
