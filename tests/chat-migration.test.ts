import { describe, it, expect } from "vitest"
import { migrations, SCHEMA_VERSION } from "@/lib/schema"

describe("chat_messages migration v19", () => {
  it("bumps SCHEMA_VERSION to 19", () => {
    expect(SCHEMA_VERSION).toBe(19)
  })

  it("registers a v19 migration that creates chat_messages", () => {
    const v19 = migrations.find((m) => m.version === 19)
    expect(v19).toBeDefined()
    expect(v19!.sql).toMatch(/CREATE TABLE IF NOT EXISTS chat_messages/i)
    expect(v19!.sql).toMatch(/chat_messages_user_created_idx/i)
    expect(v19!.sql).toMatch(/chat_messages_user_summary_idx/i)
    expect(v19!.sql).toMatch(/WHERE role = 'system'/i)
  })
})
