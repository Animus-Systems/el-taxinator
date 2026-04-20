import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mockQuery = vi.fn<(sql: string, params: unknown[]) => Promise<{ rows: unknown[] }>>()

vi.mock("@/lib/pg", () => ({
  getPool: vi.fn(async () => ({ query: mockQuery })),
}))

vi.mock("@/lib/sql", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sql")>("@/lib/sql")
  return {
    ...actual,
    mapRow: <T,>(row: unknown) => row as T,
  }
})

import { getFiles } from "@/models/files"
import { hasAnyProviderConfigured } from "@/lib/llm-providers"

describe("hasAnyProviderConfigured", () => {
  it("returns true for an empty settings map (default fallback includes subscription CLIs)", () => {
    expect(hasAnyProviderConfigured({})).toBe(true)
  })

  it("returns true when every api-key entry is blank (subscription CLIs still in default fallback)", () => {
    expect(
      hasAnyProviderConfigured({
        anthropic_api_key: "",
        openai_api_key: "   ",
        custom_api_key: "",
      }),
    ).toBe(true)
  })

  it("returns false when the user narrowed the fallback to non-subscription providers with no keys", () => {
    expect(
      hasAnyProviderConfigured({
        llm_providers: "openai,google",
        llm_primary_provider: "openai",
        llm_backup_provider: "google",
      }),
    ).toBe(false)
  })

  it("returns true when only Anthropic is configured (regression for the old 3-provider bug)", () => {
    expect(hasAnyProviderConfigured({ anthropic_api_key: "sk-ant-xxx" })).toBe(true)
  })

  it("returns true when only Codex is configured", () => {
    expect(hasAnyProviderConfigured({ codex_api_key: "cdx-xxx" })).toBe(true)
  })

  it("returns true when Anthropic (subscription CLI) is selected as primary without an API key", () => {
    expect(
      hasAnyProviderConfigured({
        llm_primary_provider: "anthropic",
        llm_backup_provider: "codex",
      }),
    ).toBe(true)
  })

  it("returns true when only a subscription backup is set", () => {
    expect(hasAnyProviderConfigured({ llm_backup_provider: "codex" })).toBe(true)
  })

  it("returns true when only OpenRouter is configured", () => {
    expect(hasAnyProviderConfigured({ openrouter_api_key: "sk-or-xxx" })).toBe(true)
  })

  it("returns true when only Custom is configured", () => {
    expect(hasAnyProviderConfigured({ custom_api_key: "xxx" })).toBe(true)
  })
})

describe("getFiles", () => {
  const USER_ID = "user-1"

  beforeEach(() => {
    mockQuery.mockReset()
    mockQuery.mockResolvedValue({ rows: [] })
    // count query returns 0 rows by default
    mockQuery.mockResolvedValueOnce({ rows: [] }) // list query
    mockQuery.mockResolvedValueOnce({ rows: [{ count: 0 }] }) // count query
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("always scopes by user_id", async () => {
    await getFiles(USER_ID, { status: "all", search: "", page: 1, pageSize: 50 })
    const calls = mockQuery.mock.calls
    expect(calls.length).toBe(2)
    for (const [sqlText, params] of calls) {
      expect(sqlText).toContain("f.user_id = $1")
      expect(params[0]).toBe(USER_ID)
    }
  })

  it("applies is_reviewed = false filter for status=unreviewed", async () => {
    await getFiles(USER_ID, { status: "unreviewed", search: "", page: 1, pageSize: 50 })
    const [sqlText] = mockQuery.mock.calls[0] ?? []
    expect(sqlText).toContain("f.is_reviewed = false")
    expect(sqlText).not.toContain("lt.id IS NOT NULL")
  })

  it("applies linked-transaction filter for status=linked", async () => {
    await getFiles(USER_ID, { status: "linked", search: "", page: 1, pageSize: 50 })
    const [sqlText] = mockQuery.mock.calls[0] ?? []
    expect(sqlText).toContain("lt.id IS NOT NULL")
    expect(sqlText).toContain("li.id IS NOT NULL")
    expect(sqlText).toContain("lis_src.id IS NOT NULL")
    expect(sqlText).toContain("lis_ctx.id IS NOT NULL")
    expect(sqlText).toContain("lpd.id IS NOT NULL")
    expect(sqlText).not.toContain("f.is_reviewed = false")
  })

  it("applies orphan filter as NOT linked AND reviewed", async () => {
    await getFiles(USER_ID, { status: "orphan", search: "", page: 1, pageSize: 50 })
    const [sqlText] = mockQuery.mock.calls[0] ?? []
    expect(sqlText).toContain("lt.id IS NULL")
    expect(sqlText).toContain("lis_src.id IS NULL")
    expect(sqlText).toContain("lis_ctx.id IS NULL")
    expect(sqlText).toContain("lpd.id IS NULL")
    expect(sqlText).toContain("f.is_reviewed = true")
  })

  it("joins import_sessions (source + context) and personal_deductions", async () => {
    await getFiles(USER_ID, { status: "all", search: "", page: 1, pageSize: 50 })
    const [sqlText] = mockQuery.mock.calls[0] ?? []
    expect(sqlText).toContain("import_sessions s")
    expect(sqlText).toContain("s.file_id = f.id")
    expect(sqlText).toContain("s.context_file_ids ? f.id::text")
    expect(sqlText).toContain("personal_deductions pd")
    expect(sqlText).toContain("pd.file_id = f.id")
  })

  it("reports an import-session source link in the row shape", async () => {
    mockQuery.mockReset()
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "f1",
          userId: "user-1",
          filename: "bbva-q1.csv",
          path: "/tmp/bbva-q1.csv",
          mimetype: "text/csv",
          metadata: { size: 2048 },
          isReviewed: true,
          isSplitted: false,
          cachedParseResult: null,
          createdAt: new Date("2026-04-16T00:00:00.000Z"),
          linked_source_session_id: "imp-1",
          linked_source_session_title: "BBVA Q1 import",
          linked_source_session_file_name: "bbva-q1.csv",
        },
      ],
    })
    mockQuery.mockResolvedValueOnce({ rows: [{ count: 1 }] })

    const { files } = await getFiles(USER_ID, { status: "linked", search: "", page: 1, pageSize: 50 })
    expect(files).toHaveLength(1)
    expect(files[0]?.linkedImportSessionId).toBe("imp-1")
    expect(files[0]?.linkedImportSessionTitle).toBe("BBVA Q1 import")
    expect(files[0]?.linkedImportSessionRole).toBe("source")
  })

  it("falls back to file_name when the import session has no title", async () => {
    mockQuery.mockReset()
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "f2",
          userId: "user-1",
          filename: "receipts.pdf",
          path: "/tmp/receipts.pdf",
          mimetype: "application/pdf",
          metadata: {},
          isReviewed: true,
          isSplitted: false,
          cachedParseResult: null,
          createdAt: new Date("2026-04-16T00:00:00.000Z"),
          linked_context_session_id: "imp-ctx-1",
          linked_context_session_title: null,
          linked_context_session_file_name: "invoice-packet.pdf",
        },
      ],
    })
    mockQuery.mockResolvedValueOnce({ rows: [{ count: 1 }] })

    const { files } = await getFiles(USER_ID, { status: "linked", search: "", page: 1, pageSize: 50 })
    expect(files[0]?.linkedImportSessionRole).toBe("context")
    expect(files[0]?.linkedImportSessionTitle).toBe("invoice-packet.pdf")
  })

  it("reports a personal-deduction link in the row shape", async () => {
    mockQuery.mockReset()
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "f3",
          userId: "user-1",
          filename: "mortgage.pdf",
          path: "/tmp/mortgage.pdf",
          mimetype: "application/pdf",
          metadata: {},
          isReviewed: true,
          isSplitted: false,
          cachedParseResult: null,
          createdAt: new Date("2026-04-16T00:00:00.000Z"),
          linked_deduction_id: "pd-1",
          linked_deduction_kind: "mortgage",
          linked_deduction_tax_year: 2026,
        },
      ],
    })
    mockQuery.mockResolvedValueOnce({ rows: [{ count: 1 }] })

    const { files } = await getFiles(USER_ID, { status: "linked", search: "", page: 1, pageSize: 50 })
    expect(files[0]?.linkedDeductionId).toBe("pd-1")
    expect(files[0]?.linkedDeductionKind).toBe("mortgage")
    expect(files[0]?.linkedDeductionTaxYear).toBe(2026)
  })

  it("passes a %...% pattern to ILIKE when searching", async () => {
    await getFiles(USER_ID, { status: "all", search: "receipt", page: 1, pageSize: 50 })
    const [sqlText, params] = mockQuery.mock.calls[0] ?? []
    expect(sqlText).toContain("f.filename ILIKE")
    expect(params).toContain("%receipt%")
  })

  it("skips the ILIKE clause when search is empty/whitespace", async () => {
    await getFiles(USER_ID, { status: "all", search: "   ", page: 1, pageSize: 50 })
    const [sqlText] = mockQuery.mock.calls[0] ?? []
    expect(sqlText).not.toContain("ILIKE")
  })

  it("paginates with LIMIT and OFFSET on the list query", async () => {
    await getFiles(USER_ID, { status: "all", search: "", page: 3, pageSize: 10 })
    const [sqlText, params] = mockQuery.mock.calls[0] ?? []
    expect(sqlText).toMatch(/LIMIT \$\d+ OFFSET \$\d+/)
    const last = params?.slice(-2) ?? []
    expect(last).toEqual([10, 20])
  })

  it("returns the total count from the count query", async () => {
    mockQuery.mockReset()
    mockQuery.mockResolvedValueOnce({ rows: [] })
    mockQuery.mockResolvedValueOnce({ rows: [{ count: 42 }] })
    const { total } = await getFiles(USER_ID, { status: "all", search: "", page: 1, pageSize: 50 })
    expect(total).toBe(42)
  })

  it("shapes each row with linkedTransactionId and linkedTransactionName", async () => {
    mockQuery.mockReset()
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "f1",
          userId: "user-1",
          filename: "receipt.pdf",
          path: "/tmp/receipt.pdf",
          mimetype: "application/pdf",
          metadata: { size: 1024 },
          isReviewed: true,
          isSplitted: false,
          cachedParseResult: null,
          createdAt: new Date("2026-04-16T00:00:00.000Z"),
          linked_transaction_id: "tx-99",
          linked_transaction_name: "Grocery run",
        },
      ],
    })
    mockQuery.mockResolvedValueOnce({ rows: [{ count: 1 }] })

    const { files } = await getFiles(USER_ID, { status: "linked", search: "", page: 1, pageSize: 50 })
    expect(files).toHaveLength(1)
    expect(files[0]?.linkedTransactionId).toBe("tx-99")
    expect(files[0]?.linkedTransactionName).toBe("Grocery run")
  })
})
