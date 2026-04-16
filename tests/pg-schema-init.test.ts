import { beforeEach, describe, expect, it, vi } from "vitest"
import fs from "node:fs"
import path from "node:path"

const mocks = vi.hoisted(() => ({
  ensureSchema: vi.fn(),
  getEntityPool: vi.fn(),
}))

vi.mock("@/lib/entities", () => ({
  getPool: (...args: unknown[]) => mocks.getEntityPool(...args),
}))

vi.mock("@/lib/schema", () => ({
  SCHEMA_VERSION: 17,
  ensureSchema: (...args: unknown[]) => mocks.ensureSchema(...args),
}))

describe("lib/pg.getPool", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it("ensures the database schema before returning the active entity pool", async () => {
    const fakePool = { options: { connectionString: "postgres://entity-a" } }
    mocks.getEntityPool.mockResolvedValue(fakePool)
    mocks.ensureSchema.mockResolvedValue({ status: "up_to_date" })

    const { getPool } = await import("@/lib/pg")
    const pool = await getPool()

    expect(pool).toBe(fakePool)
    expect(mocks.ensureSchema).toHaveBeenCalledWith(fakePool)
  })

  it("keeps SCHEMA_VERSION aligned with the highest declared migration", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "lib/schema.ts"), "utf-8")
    const versionMatch = source.match(/const SCHEMA_VERSION = (\d+)/)
    const migrationVersions = Array.from(source.matchAll(/version:\s*(\d+)/g)).map((match) => Number(match[1]))

    expect(versionMatch?.[1]).toBeDefined()
    expect(migrationVersions.length).toBeGreaterThan(0)
    expect(Number(versionMatch?.[1])).toBe(Math.max(...migrationVersions))
  })
})
