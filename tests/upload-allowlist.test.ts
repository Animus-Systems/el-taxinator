import { describe, it, expect } from "vitest"
import { verifyUpload } from "@/lib/upload-allowlist"

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
const PDF = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00])
const WEBP = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46,
  0x00, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50,
])
const ZIP = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x00])
const OLE2 = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
const EXE = Uint8Array.from([0x4d, 0x5a, 0x90, 0x00])

describe("verifyUpload", () => {
  it("accepts a matching png", () => {
    expect(verifyUpload("image/png", PNG)).toEqual({ ok: true, mimetype: "image/png" })
  })

  it("accepts a matching pdf", () => {
    expect(verifyUpload("application/pdf", PDF)).toEqual({
      ok: true,
      mimetype: "application/pdf",
    })
  })

  it("accepts a matching jpeg", () => {
    expect(verifyUpload("image/jpeg", JPEG)).toEqual({
      ok: true,
      mimetype: "image/jpeg",
    })
  })

  it("accepts a matching webp", () => {
    expect(verifyUpload("image/webp", WEBP)).toEqual({
      ok: true,
      mimetype: "image/webp",
    })
  })

  it("rejects a disallowed mimetype", () => {
    const res = verifyUpload("application/x-msdownload", EXE)
    expect(res.ok).toBe(false)
  })

  it("rejects exe bytes claiming image/png", () => {
    const res = verifyUpload("image/png", EXE)
    expect(res.ok).toBe(false)
  })

  it("rejects jpeg bytes claiming application/pdf", () => {
    const res = verifyUpload("application/pdf", JPEG)
    expect(res.ok).toBe(false)
  })

  it("accepts a docx zip container", () => {
    expect(
      verifyUpload(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ZIP,
      ),
    ).toEqual({
      ok: true,
      mimetype:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    })
  })

  it("accepts a legacy .doc OLE2 container", () => {
    expect(verifyUpload("application/msword", OLE2)).toEqual({
      ok: true,
      mimetype: "application/msword",
    })
  })

  it("rejects a .doc claim that isn't OLE2", () => {
    expect(verifyUpload("application/msword", ZIP).ok).toBe(false)
  })

  it("accepts text/csv without byte verification", () => {
    expect(verifyUpload("text/csv", new Uint8Array([0x00]))).toEqual({
      ok: true,
      mimetype: "text/csv",
    })
  })

  it("accepts image/heic without byte verification", () => {
    expect(verifyUpload("image/heic", new Uint8Array([0x00]))).toEqual({
      ok: true,
      mimetype: "image/heic",
    })
  })
})
