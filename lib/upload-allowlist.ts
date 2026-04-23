/**
 * Server-side MIME allowlist + magic-byte verification for uploads.
 *
 * The client's `<input accept=>` attribute is advisory; this is the
 * authoritative server check. Callers pass the claimed mimetype and the
 * first bytes of the file — `verifyUpload` returns `{ ok, mimetype }` on
 * success or `{ ok: false, reason }` when the claim fails either the
 * allowlist or the signature check.
 */

export const ALLOWED_MIMETYPES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/svg+xml",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
])

type Signature = {
  mime: string
  magic: readonly (number | null)[]
  offset?: number
}

// null = wildcard byte. Only list formats where the claimed mime must be
// corroborated by bytes.
const SIGNATURES: readonly Signature[] = [
  { mime: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
  { mime: "image/png", magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/gif", magic: [0x47, 0x49, 0x46, 0x38] },
  {
    mime: "image/webp",
    magic: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50],
  },
  { mime: "application/pdf", magic: [0x25, 0x50, 0x44, 0x46, 0x2d] },
]

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04] // .docx/.xlsx container
const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] // legacy .doc/.xls

const OFFICE_ZIP_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
])
const OFFICE_OLE2_MIMES = new Set([
  "application/msword",
  "application/vnd.ms-excel",
])

function matches(
  buf: Uint8Array,
  magic: readonly (number | null)[],
  offset = 0,
): boolean {
  if (buf.length < offset + magic.length) return false
  for (let i = 0; i < magic.length; i++) {
    const m = magic[i]
    if (m === null) continue
    if (buf[offset + i] !== m) return false
  }
  return true
}

export type UploadCheckResult =
  | { ok: true; mimetype: string }
  | { ok: false; reason: string }

/**
 * Verify that (claimed mimetype, buffer) is on the allowlist and that the
 * bytes plausibly match the claim. Returns the sanitized mimetype on success.
 */
export function verifyUpload(
  claimedMimetype: string,
  buffer: Uint8Array,
): UploadCheckResult {
  if (!ALLOWED_MIMETYPES.has(claimedMimetype)) {
    return { ok: false, reason: `mimetype not allowed: ${claimedMimetype}` }
  }

  // Text-like formats have no fixed signature — claim is authoritative.
  if (
    claimedMimetype === "text/csv" ||
    claimedMimetype === "text/plain" ||
    claimedMimetype === "image/svg+xml"
  ) {
    return { ok: true, mimetype: claimedMimetype }
  }

  // HEIC/HEIF sit inside ISO-BMFF; browsers identify reliably by extension.
  if (claimedMimetype === "image/heic" || claimedMimetype === "image/heif") {
    return { ok: true, mimetype: claimedMimetype }
  }

  if (OFFICE_ZIP_MIMES.has(claimedMimetype)) {
    return matches(buffer, ZIP_MAGIC)
      ? { ok: true, mimetype: claimedMimetype }
      : { ok: false, reason: "file is not a valid Office Open XML document" }
  }
  if (OFFICE_OLE2_MIMES.has(claimedMimetype)) {
    return matches(buffer, OLE2_MAGIC)
      ? { ok: true, mimetype: claimedMimetype }
      : { ok: false, reason: "file is not a valid legacy Office document" }
  }

  const sig = SIGNATURES.find((s) => s.mime === claimedMimetype)
  if (!sig) {
    return { ok: false, reason: `no signature registered for ${claimedMimetype}` }
  }
  return matches(buffer, sig.magic, sig.offset ?? 0)
    ? { ok: true, mimetype: claimedMimetype }
    : { ok: false, reason: `file contents do not match ${claimedMimetype}` }
}
