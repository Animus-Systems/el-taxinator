import { describe, it, expect } from "vitest"
import {
  extractFirstJsonObject,
  extractAllJsonObjects,
  parseLLMJson,
} from "@/ai/providers/parse-json"

describe("extractFirstJsonObject", () => {
  it("returns null when no object is present", () => {
    expect(extractFirstJsonObject("nope")).toBeNull()
    expect(extractFirstJsonObject("")).toBeNull()
  })

  it("extracts a simple top-level object", () => {
    expect(extractFirstJsonObject(`{"a":1}`)).toBe(`{"a":1}`)
  })

  it("ignores text before and after the object", () => {
    const got = extractFirstJsonObject('Here you go:\n{"x":2}\nhope that helps')
    expect(got).toBe(`{"x":2}`)
  })

  it("returns the first object when multiple are present", () => {
    expect(extractFirstJsonObject(`{"first":1}\n{"second":2}`)).toBe(`{"first":1}`)
  })

  it("handles braces inside strings without losing track", () => {
    const text = `prefix {"msg":"hello {world}","n":3} trailing`
    expect(extractFirstJsonObject(text)).toBe(`{"msg":"hello {world}","n":3}`)
  })

  it("handles escaped quotes inside string values", () => {
    const text = `intro {"msg":"she said \\"hi\\"","ok":true} ...`
    expect(extractFirstJsonObject(text)).toBe(`{"msg":"she said \\"hi\\"","ok":true}`)
  })

  it("survives markdown code fences (finds the object inside)", () => {
    const text = "```json\n{\"ok\":true}\n```"
    expect(extractFirstJsonObject(text)).toBe(`{"ok":true}`)
  })

  it("returns null on an unclosed object (does not throw)", () => {
    expect(extractFirstJsonObject(`{"a":1,"b":`)).toBeNull()
  })
})

describe("parseLLMJson", () => {
  it("parses a well-formed object", () => {
    expect(parseLLMJson(`{"assistantMessage":"hi","candidateUpdates":[]}`))
      .toEqual({ assistantMessage: "hi", candidateUpdates: [] })
  })

  it("returns null for non-object JSON values", () => {
    // arrays, numbers, and bare strings shouldn't be considered a valid top-level object
    expect(parseLLMJson(`[1,2,3]`)).toBeNull()
    expect(parseLLMJson(`42`)).toBeNull()
    expect(parseLLMJson(`"hi"`)).toBeNull()
  })

  it("returns null when JSON is malformed even if braces look balanced", () => {
    expect(parseLLMJson(`{"a":}`)).toBeNull()
  })

  it("ignores trailing prose and parses the leading object", () => {
    const result = parseLLMJson(`{"a":1} — note: this is not JSON.`)
    expect(result).toEqual({ a: 1 })
  })
})

describe("extractAllJsonObjects", () => {
  it("returns an empty array for text with no objects", () => {
    expect(extractAllJsonObjects("hello")).toEqual([])
  })

  it("finds every top-level balanced object, in order", () => {
    const text = `prefix {"a":1} middle {"b":2} {"c":3}`
    expect(extractAllJsonObjects(text)).toEqual([`{"a":1}`, `{"b":2}`, `{"c":3}`])
  })

  it("treats braces inside strings as literals, not structure", () => {
    const text = `{"x":"has { and }"} {"y":2}`
    expect(extractAllJsonObjects(text)).toEqual([`{"x":"has { and }"}`, `{"y":2}`])
  })
})

describe("parseLLMJson with requiredKeys", () => {
  it("prefers the object that has the required keys (codex multi-event output)", () => {
    const text = [
      `{"type":"event","name":"started"}`,
      `{"type":"event","name":"partial"}`,
      `{"assistantMessage":"hi","candidateUpdates":[]}`,
      `{"type":"event","name":"ended"}`,
    ].join("\n")
    const result = parseLLMJson(text, { requiredKeys: ["assistantMessage"] })
    expect(result).toEqual({ assistantMessage: "hi", candidateUpdates: [] })
  })

  it("walks into nested envelopes to find the payload", () => {
    const text = `{"type":"message","payload":{"assistantMessage":"hi","x":1}}`
    const result = parseLLMJson(text, { requiredKeys: ["assistantMessage"] })
    expect(result).toEqual({ assistantMessage: "hi", x: 1 })
  })

  it("falls back to the largest object when nothing matches required keys", () => {
    const text = `{"a":1} {"b":2,"c":3,"d":4}`
    const result = parseLLMJson(text, { requiredKeys: ["assistantMessage"] })
    // fallback is the larger of the two
    expect(result).toEqual({ b: 2, c: 3, d: 4 })
  })

  it("returns null when no parsable JSON is present", () => {
    expect(parseLLMJson("just prose", { requiredKeys: ["assistantMessage"] })).toBeNull()
  })

  it("unwraps codex item.completed where the reply is a JSON string inside item.text", () => {
    // codex exec --json emits one envelope per event. The real reply is
    // serialised inside the string field `item.text`, not a nested object.
    const inner = JSON.stringify({ assistantMessage: "hi", candidateUpdates: [] })
    const text = [
      `{"type":"thread.started","thread_id":"abc"}`,
      `{"type":"turn.started"}`,
      `{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":${JSON.stringify(inner)}}}`,
    ].join("\n")
    const result = parseLLMJson(text, { requiredKeys: ["assistantMessage"] })
    expect(result).toEqual({ assistantMessage: "hi", candidateUpdates: [] })
  })

  it("finds a payload inside a stringified array element", () => {
    const reply = { assistantMessage: "yes", taxTips: [] }
    const wrapper = { items: [JSON.stringify(reply)] }
    const result = parseLLMJson(JSON.stringify(wrapper), { requiredKeys: ["assistantMessage"] })
    expect(result).toEqual(reply)
  })
})
