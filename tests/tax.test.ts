import { describe, expect, it, vi } from "vitest"

// Mock the database module before importing tax model
vi.mock("@/lib/pg", () => ({
  getPool: vi.fn(),
}))

import {
  getTaxPeriod,
  getQuarterLabel,
  getFilingDeadline,
  getUpcomingDeadlines,
  type Quarter,
} from "@/models/tax"

describe("getTaxPeriod", () => {
  it("returns correct Q1 period (Jan-Mar)", () => {
    const { start, end } = getTaxPeriod(2026, 1)
    expect(start.getFullYear()).toBe(2026)
    expect(start.getMonth()).toBe(0) // January
    expect(start.getDate()).toBe(1)
    expect(end.getMonth()).toBe(2) // March
    expect(end.getDate()).toBe(31)
  })

  it("returns correct Q2 period (Apr-Jun)", () => {
    const { start, end } = getTaxPeriod(2026, 2)
    expect(start.getMonth()).toBe(3) // April
    expect(start.getDate()).toBe(1)
    expect(end.getMonth()).toBe(5) // June
    expect(end.getDate()).toBe(30)
  })

  it("returns correct Q3 period (Jul-Sep)", () => {
    const { start, end } = getTaxPeriod(2026, 3)
    expect(start.getMonth()).toBe(6) // July
    expect(start.getDate()).toBe(1)
    expect(end.getMonth()).toBe(8) // September
    expect(end.getDate()).toBe(30)
  })

  it("returns correct Q4 period (Oct-Dec)", () => {
    const { start, end } = getTaxPeriod(2026, 4)
    expect(start.getMonth()).toBe(9) // October
    expect(start.getDate()).toBe(1)
    expect(end.getMonth()).toBe(11) // December
    expect(end.getDate()).toBe(31)
  })

  it("end date is set to end of day (23:59:59.999)", () => {
    const { end } = getTaxPeriod(2026, 1)
    expect(end.getHours()).toBe(23)
    expect(end.getMinutes()).toBe(59)
    expect(end.getSeconds()).toBe(59)
    expect(end.getMilliseconds()).toBe(999)
  })

  it("start date is beginning of day (00:00:00.000)", () => {
    const { start } = getTaxPeriod(2026, 1)
    expect(start.getHours()).toBe(0)
    expect(start.getMinutes()).toBe(0)
    expect(start.getSeconds()).toBe(0)
  })

  it("handles leap year correctly for Q1", () => {
    const { end } = getTaxPeriod(2028, 1) // 2028 is a leap year
    expect(end.getMonth()).toBe(2)
    expect(end.getDate()).toBe(31)
  })
})

describe("getQuarterLabel", () => {
  it("returns English label by default for Q1", () => {
    expect(getQuarterLabel(1)).toBe("Q1 (Jan\u2013Mar)")
  })

  it("returns English label by default for Q2", () => {
    expect(getQuarterLabel(2)).toBe("Q2 (Apr\u2013Jun)")
  })

  it("returns English label by default for Q3", () => {
    expect(getQuarterLabel(3)).toBe("Q3 (Jul\u2013Sep)")
  })

  it("returns English label by default for Q4", () => {
    expect(getQuarterLabel(4)).toBe("Q4 (Oct\u2013Dec)")
  })

  it("returns Spanish label when locale is es", () => {
    expect(getQuarterLabel(1, "es")).toBe("Q1 (Ene\u2013Mar)")
    expect(getQuarterLabel(2, "es")).toBe("Q2 (Abr\u2013Jun)")
    expect(getQuarterLabel(3, "es")).toBe("Q3 (Jul\u2013Sep)")
    expect(getQuarterLabel(4, "es")).toBe("Q4 (Oct\u2013Dic)")
  })
})

describe("getFilingDeadline", () => {
  it("Q1 deadline is April 20", () => {
    const deadline = getFilingDeadline(2026, 1)
    expect(deadline.getFullYear()).toBe(2026)
    expect(deadline.getMonth()).toBe(3) // April
    expect(deadline.getDate()).toBe(20)
  })

  it("Q2 deadline is July 20", () => {
    const deadline = getFilingDeadline(2026, 2)
    expect(deadline.getFullYear()).toBe(2026)
    expect(deadline.getMonth()).toBe(6) // July
    expect(deadline.getDate()).toBe(20)
  })

  it("Q3 deadline is October 20", () => {
    const deadline = getFilingDeadline(2026, 3)
    expect(deadline.getFullYear()).toBe(2026)
    expect(deadline.getMonth()).toBe(9) // October
    expect(deadline.getDate()).toBe(20)
  })

  it("Q4 deadline is January 30 of the next year", () => {
    const deadline = getFilingDeadline(2026, 4)
    expect(deadline.getFullYear()).toBe(2027)
    expect(deadline.getMonth()).toBe(0) // January
    expect(deadline.getDate()).toBe(30)
  })

  it("Q4 deadline correctly rolls to next year for year boundary", () => {
    const deadline = getFilingDeadline(2025, 4)
    expect(deadline.getFullYear()).toBe(2026)
  })
})

describe("getUpcomingDeadlines", () => {
  it("returns 4 deadlines for a year", () => {
    const deadlines = getUpcomingDeadlines(2026)
    expect(deadlines).toHaveLength(4)
  })

  it("each deadline has a quarter, label, deadline date, and forms", () => {
    const deadlines = getUpcomingDeadlines(2026)
    for (const d of deadlines) {
      expect(d).toHaveProperty("quarter")
      expect(d).toHaveProperty("label")
      expect(d).toHaveProperty("deadline")
      expect(d).toHaveProperty("forms")
      expect(d.deadline).toBeInstanceOf(Date)
    }
  })

  it("Q1-Q3 have forms 420 and 130", () => {
    const deadlines = getUpcomingDeadlines(2026)
    for (const d of deadlines.slice(0, 3)) {
      expect(d.forms).toEqual(["420", "130"])
    }
  })

  it("Q4 additionally includes form 425 (annual IGIC summary)", () => {
    const deadlines = getUpcomingDeadlines(2026)
    const q4 = deadlines[3]
    expect(q4.forms).toEqual(["420", "130", "425"])
  })

  it("quarters are ordered 1 through 4", () => {
    const deadlines = getUpcomingDeadlines(2026)
    expect(deadlines.map((d) => d.quarter)).toEqual([1, 2, 3, 4])
  })

  it("labels match getQuarterLabel output", () => {
    const deadlines = getUpcomingDeadlines(2026)
    for (const d of deadlines) {
      expect(d.label).toBe(getQuarterLabel(d.quarter as Quarter))
    }
  })
})
