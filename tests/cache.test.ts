import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { PoorManCache } from "@/lib/cache"

describe("PoorManCache", () => {
  let cache: PoorManCache<string>

  beforeEach(() => {
    cache = new PoorManCache<string>(1000) // 1 second TTL
  })

  describe("set and get", () => {
    it("stores and retrieves a value", () => {
      cache.set("key1", "value1")
      expect(cache.get("key1")).toBe("value1")
    })

    it("stores multiple values", () => {
      cache.set("a", "alpha")
      cache.set("b", "beta")
      expect(cache.get("a")).toBe("alpha")
      expect(cache.get("b")).toBe("beta")
    })

    it("overwrites existing value", () => {
      cache.set("key", "old")
      cache.set("key", "new")
      expect(cache.get("key")).toBe("new")
    })

    it("returns undefined for non-existent key", () => {
      expect(cache.get("missing")).toBeUndefined()
    })
  })

  describe("TTL expiration", () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it("returns value before expiration", () => {
      cache.set("key", "value")
      vi.advanceTimersByTime(500) // advance 500ms (TTL is 1000ms)
      expect(cache.get("key")).toBe("value")
    })

    it("returns undefined after expiration", () => {
      cache.set("key", "value")
      vi.advanceTimersByTime(1001) // advance past TTL
      expect(cache.get("key")).toBeUndefined()
    })

    it("has() returns false for expired entries", () => {
      cache.set("key", "value")
      vi.advanceTimersByTime(1001)
      expect(cache.has("key")).toBe(false)
    })

    it("has() returns true for valid entries", () => {
      cache.set("key", "value")
      vi.advanceTimersByTime(500)
      expect(cache.has("key")).toBe(true)
    })
  })

  describe("cleanup", () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it("removes expired entries", () => {
      cache.set("expired", "old")
      vi.advanceTimersByTime(1001)
      cache.set("fresh", "new")

      cache.cleanup()

      expect(cache.size()).toBe(1)
      expect(cache.get("expired")).toBeUndefined()
      expect(cache.get("fresh")).toBe("new")
    })

    it("keeps non-expired entries", () => {
      cache.set("a", "alpha")
      cache.set("b", "beta")
      vi.advanceTimersByTime(500) // still within TTL

      cache.cleanup()
      expect(cache.size()).toBe(2)
    })

    it("removes all entries when all expired", () => {
      cache.set("a", "alpha")
      cache.set("b", "beta")
      vi.advanceTimersByTime(1001)

      cache.cleanup()
      expect(cache.size()).toBe(0)
    })
  })

  describe("delete", () => {
    it("removes a specific key", () => {
      cache.set("key", "value")
      cache.delete("key")
      expect(cache.get("key")).toBeUndefined()
    })

    it("does not affect other keys when deleting", () => {
      cache.set("a", "alpha")
      cache.set("b", "beta")
      cache.delete("a")
      expect(cache.get("b")).toBe("beta")
    })
  })

  describe("clear", () => {
    it("removes all entries", () => {
      cache.set("a", "alpha")
      cache.set("b", "beta")
      cache.set("c", "gamma")
      cache.clear()
      expect(cache.size()).toBe(0)
    })
  })

  describe("size", () => {
    it("returns 0 for empty cache", () => {
      expect(cache.size()).toBe(0)
    })

    it("returns correct count after adding entries", () => {
      cache.set("a", "1")
      cache.set("b", "2")
      expect(cache.size()).toBe(2)
    })

    it("does not change when overwriting a key", () => {
      cache.set("key", "v1")
      cache.set("key", "v2")
      expect(cache.size()).toBe(1)
    })
  })

  describe("has", () => {
    it("returns false for non-existent key", () => {
      expect(cache.has("missing")).toBe(false)
    })

    it("returns true for existing key", () => {
      cache.set("key", "val")
      expect(cache.has("key")).toBe(true)
    })
  })

  describe("typed cache", () => {
    it("works with number values", () => {
      const numCache = new PoorManCache<number>(5000)
      numCache.set("count", 42)
      expect(numCache.get("count")).toBe(42)
    })

    it("works with object values", () => {
      const objCache = new PoorManCache<{ name: string }>(5000)
      objCache.set("user", { name: "Seth" })
      expect(objCache.get("user")).toEqual({ name: "Seth" })
    })

    it("works with array values", () => {
      const arrCache = new PoorManCache<string[]>(5000)
      arrCache.set("list", ["a", "b", "c"])
      expect(arrCache.get("list")).toEqual(["a", "b", "c"])
    })
  })
})
