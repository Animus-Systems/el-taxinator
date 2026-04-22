import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

type FakeQuery = { text: string; values: unknown[] }

vi.mock("@/lib/pg", () => {
  const state = {
    queue: [] as Record<string, unknown>[][],
    queries: [] as FakeQuery[],
  }
  const dequeue = (): Record<string, unknown>[] => state.queue.shift() ?? []
  return {
    __state: state,
    getPool: async () => ({
      query: async (text: string, values: unknown[] = []) => {
        state.queries.push({ text, values })
        const rows = dequeue()
        return { rows, rowCount: rows.length }
      },
      connect: async () => ({
        query: async (text: string, values: unknown[] = []) => {
          state.queries.push({ text, values })
          const rows = dequeue()
          return { rows, rowCount: rows.length }
        },
        release: () => undefined,
      }),
    }),
  }
})

import * as pg from "@/lib/pg"
import { getEurPerUnit } from "@/models/fx-rates"

type State = { queue: Record<string, unknown>[][]; queries: FakeQuery[] }
function getState(): State {
  return (pg as unknown as { __state: State }).__state
}
function enqueueRows(...rowsets: Record<string, unknown>[][]): void {
  getState().queue.push(...rowsets)
}
function queries(): FakeQuery[] {
  return getState().queries
}

const ECB_90D = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml"
const ECB_HIST = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml"

/** Minimal ECB-shaped XML. The real feed has more currencies and more days
 * but the parser only cares about the Cube time / Cube currency / rate shape. */
function ecbXml(days: { date: string; rates: Record<string, number> }[]): string {
  const cubes = days
    .map((d) => {
      const inner = Object.entries(d.rates)
        .map(([code, rate]) => `<Cube currency="${code}" rate="${rate}"/>`)
        .join("")
      return `<Cube time="${d.date}">${inner}</Cube>`
    })
    .join("")
  return `<?xml version="1.0" encoding="UTF-8"?><gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref"><Cube>${cubes}</Cube></gesmes:Envelope>`
}

function mockFetchXml(url: string, xml: string): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const requested = typeof input === "string" ? input : input.toString()
      if (requested === url) {
        return new Response(xml, { status: 200, headers: { "Content-Type": "application/xml" } })
      }
      return new Response("not found", { status: 404 })
    }),
  )
}

function mockFetchFailure(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("network down")
    }),
  )
}

describe("models/fx-rates.getEurPerUnit", () => {
  beforeEach(() => {
    const state = getState()
    state.queue = []
    state.queries = []
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("returns null for EUR without hitting the database or network", async () => {
    const result = await getEurPerUnit("EUR", new Date("2026-04-22"))
    expect(result).toBeNull()
    expect(queries().length).toBe(0)
  })

  it("returns the cached row when a recent rate is already stored", async () => {
    const onDate = new Date("2026-04-22")
    enqueueRows([
      {
        rate_date: new Date("2026-04-22"),
        currency: "GBP",
        eur_per_unit: "1.1472000000",
      },
    ])

    const result = await getEurPerUnit("GBP", onDate)

    expect(result).toEqual({
      eurPerUnit: "1.1472000000",
      effectiveDate: new Date("2026-04-22"),
      source: expect.stringContaining("ecb.europa.eu"),
    })
    // Only the cache lookup — no ECB fetch.
    expect(queries().length).toBe(1)
    expect(queries()[0]?.text).toMatch(/SELECT[\s\S]*FROM fx_rates/i)
  })

  it("accepts a cached rate within 7 days of the issue date (weekend/holiday fallback)", async () => {
    // Issue date is a Sunday; Friday is the most recent trading day.
    const onDate = new Date("2026-04-26") // Sunday
    enqueueRows([
      {
        rate_date: new Date("2026-04-24"), // Friday
        currency: "GBP",
        eur_per_unit: "1.1472000000",
      },
    ])

    const result = await getEurPerUnit("GBP", onDate)

    expect(result?.eurPerUnit).toBe("1.1472000000")
    expect(result?.effectiveDate.toISOString().slice(0, 10)).toBe("2026-04-24")
  })

  it("fetches the 90-day feed and populates the cache when no cached rate exists", async () => {
    const onDate = new Date("2026-04-22")
    // The mock dequeues one rowset per pool.query call. Order of queries
    // in this flow: first SELECT (miss) → INSERT (upsert, no rows) → second
    // SELECT (cache hit). Queue three rowsets so each call has a target.
    enqueueRows(
      [],
      [],
      [
        {
          rate_date: new Date("2026-04-22"),
          currency: "GBP",
          eur_per_unit: "1.1472",
        },
      ],
    )
    mockFetchXml(
      ECB_90D,
      ecbXml([
        {
          date: "2026-04-22",
          // ECB publishes foreign-per-EUR; 1 EUR = 0.8716 GBP ⇒ 1 GBP ≈ 1.1472 EUR.
          rates: { GBP: 0.8716, USD: 1.0852 },
        },
      ]),
    )

    const result = await getEurPerUnit("GBP", onDate)

    expect(result).not.toBeNull()
    // Upsert wrote something to fx_rates.
    const upsert = queries().find((q) => /INSERT INTO fx_rates/i.test(q.text))
    expect(upsert).toBeTruthy()
    // eur_per_unit inverted from the raw 0.8716 rate (1 / 0.8716 ≈ 1.1472).
    expect(Number(result?.eurPerUnit)).toBeCloseTo(1.1472, 3)
  })

  it("reaches for the full history feed when the issue date is older than the 90-day window", async () => {
    const onDate = new Date("2024-01-10") // well over 90 days ago from 2026
    // Order: miss → INSERT → hit.
    enqueueRows(
      [],
      [],
      [
        {
          rate_date: new Date("2024-01-10"),
          currency: "GBP",
          eur_per_unit: "1.1472",
        },
      ],
    )

    let fetched: string | null = null
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        fetched = typeof input === "string" ? input : input.toString()
        return new Response(
          ecbXml([{ date: "2024-01-10", rates: { GBP: 0.8716 } }]),
          { status: 200, headers: { "Content-Type": "application/xml" } },
        )
      }),
    )

    await getEurPerUnit("GBP", onDate)

    expect(fetched).toBe(ECB_HIST)
  })

  it("returns null when the requested currency is not in ECB's list", async () => {
    const onDate = new Date("2026-04-22")
    // Miss → INSERT → still miss (ZZZ never appeared in the feed).
    enqueueRows([], [], [])
    mockFetchXml(
      ECB_90D,
      ecbXml([{ date: "2026-04-22", rates: { GBP: 0.8716 } }]), // no ZZZ
    )

    const result = await getEurPerUnit("ZZZ", onDate)
    expect(result).toBeNull()
  })

  it("returns null and does not throw when the ECB fetch fails", async () => {
    const onDate = new Date("2026-04-22")
    enqueueRows([]) // no cache
    mockFetchFailure()

    const result = await getEurPerUnit("GBP", onDate)
    expect(result).toBeNull()
  })
})
