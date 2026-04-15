/**
 * Extracts the first complete top-level JSON object from a string.
 *
 * The previous regex `/\{[\s\S]*\}/` is greedy and breaks on outputs like:
 *   - Markdown-fenced JSON (```json {...} ```)
 *   - JSON followed by trailing prose
 *   - Multiple top-level objects in the same response
 *
 * This walks the string tracking brace depth while respecting string
 * literals (including escaped quotes) so it returns exactly the substring
 * spanning the first `{` to its matching `}`.
 */
export function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{")
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escape = false

  for (let i = start; i < text.length; i++) {
    const ch = text[i]

    if (escape) {
      escape = false
      continue
    }
    if (ch === "\\") {
      if (inString) escape = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue

    if (ch === "{") depth += 1
    else if (ch === "}") {
      depth -= 1
      if (depth === 0) {
        return text.slice(start, i + 1)
      }
    }
  }

  return null
}

/**
 * Extract every top-level balanced JSON object from a blob of text. Handles
 * streams like `codex exec --json` that emit one object per event line.
 */
export function extractAllJsonObjects(text: string): string[] {
  const out: string[] = []
  let i = 0
  while (i < text.length) {
    const start = text.indexOf("{", i)
    if (start === -1) break

    let depth = 0
    let inString = false
    let escape = false
    let end = -1

    for (let j = start; j < text.length; j++) {
      const ch = text[j]
      if (escape) {
        escape = false
        continue
      }
      if (ch === "\\") {
        if (inString) escape = true
        continue
      }
      if (ch === '"') {
        inString = !inString
        continue
      }
      if (inString) continue

      if (ch === "{") depth += 1
      else if (ch === "}") {
        depth -= 1
        if (depth === 0) {
          end = j + 1
          break
        }
      }
    }

    if (end === -1) break
    out.push(text.slice(start, end))
    i = end
  }
  return out
}

function tryParseObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // ignore
  }
  return null
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

/**
 * Depth-first search for an object in a parsed tree that contains ALL the
 * given required keys. Handles CLI output envelopes like
 *   { "type": "message", "message": { "assistantMessage": "..." } }
 * where the real payload is nested inside a wrapper event.
 *
 * Also handles string fields that themselves contain JSON — codex wraps the
 * assistant reply as `{type:"item.completed", item:{text:"{...}"}}` where
 * `text` is an escaped JSON string.
 */
function findObjectWithKeys(
  obj: unknown,
  requiredKeys: string[],
  depth = 0,
): Record<string, unknown> | null {
  if (depth > 8) return null
  if (obj === null || obj === undefined) return null

  if (typeof obj === "string") {
    const trimmed = obj.trim()
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null
    // Whole-string parse first.
    const whole = safeParse(trimmed)
    if (whole !== undefined) {
      const match = findObjectWithKeys(whole, requiredKeys, depth + 1)
      if (match) return match
    }
    // Fallback: balanced-brace extraction for strings with trailing prose.
    const raws = extractAllJsonObjects(trimmed)
    for (let i = raws.length - 1; i >= 0; i--) {
      const parsed = tryParseObject(raws[i])
      if (!parsed) continue
      const match = findObjectWithKeys(parsed, requiredKeys, depth + 1)
      if (match) return match
    }
    return null
  }

  if (Array.isArray(obj)) {
    for (let i = obj.length - 1; i >= 0; i--) {
      const match = findObjectWithKeys(obj[i], requiredKeys, depth + 1)
      if (match) return match
    }
    return null
  }

  if (typeof obj !== "object") return null
  const candidate = obj as Record<string, unknown>
  if (requiredKeys.every((k) => k in candidate)) return candidate

  for (const value of Object.values(candidate)) {
    const nested = findObjectWithKeys(value, requiredKeys, depth + 1)
    if (nested) return nested
  }
  return null
}

/**
 * Parses LLM CLI output to a JSON object using the balanced-brace extractor.
 * Returns null if no parsable JSON is found.
 *
 * When `requiredKeys` is provided (e.g. `["assistantMessage"]`), the parser
 * scans ALL top-level objects AND their nested children, returning the best
 * match — this handles providers like codex that stream one JSON event per
 * line where only the final event contains the real response.
 */
export function parseLLMJson(
  text: string,
  opts: { requiredKeys?: string[] } = {},
): Record<string, unknown> | null {
  const requiredKeys = opts.requiredKeys ?? []
  const raws = extractAllJsonObjects(text)
  if (raws.length === 0) return null

  // Fast path: single object, no filter.
  if (raws.length === 1 && requiredKeys.length === 0) {
    return tryParseObject(raws[0])
  }

  let fallback: Record<string, unknown> | null = null
  let fallbackSize = -1

  // Walk objects in REVERSE order — for stream-of-events CLIs the final answer
  // is the last emitted object. A first-match-wins with required keys also
  // means the most recent matching object wins when multiple exist.
  for (let i = raws.length - 1; i >= 0; i--) {
    const parsed = tryParseObject(raws[i])
    if (!parsed) continue

    if (requiredKeys.length === 0) {
      return parsed
    }

    // Direct match on top-level keys.
    if (requiredKeys.every((k) => k in parsed)) {
      return parsed
    }

    // Nested match (e.g. codex wraps payload under .message or .content).
    const nested = findObjectWithKeys(parsed, requiredKeys)
    if (nested) return nested

    const size = raws[i].length
    if (size > fallbackSize) {
      fallback = parsed
      fallbackSize = size
    }
  }

  return fallback
}
