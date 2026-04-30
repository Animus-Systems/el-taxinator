import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type express from "express";
import multer from "multer";
import { TRPCError } from "@trpc/server";
import { config } from "../config.js";
import type { appDb } from "../db/appDb.js";
import { getBearerToken, verifyAccessToken } from "../auth/jwt.js";

// On-disk file uploads.
//
// Layout: <UPLOAD_DIR>/<tenantId>/<YYYY>/<MM>/<uuid>.<ext>
//
// Tenant id at the top level means a malformed query, a bug in tenant scoping,
// or even an attacker with a tenantA token can never reach a tenantB blob on
// disk — the path itself enforces isolation.
//
// JSON-style auth lives next to the auth/ stack: bearer token verified per
// request, then we hit core.tenant_member to confirm the user belongs to the
// tenant in the URL. Both upload and download share the same gate.

type Deps = { appDb: typeof appDb };

const UUID_RE = /^[0-9a-fA-F-]{36}$/;
const TENANT_PATH_RE = /^\/tenants\/([0-9a-fA-F-]{36})\/files(?:\/[0-9a-fA-F-]{36}(?:\/.*)?)?$/;

const sanitiseFilename = (raw: string): string => {
  // Strip directories, control chars, and leading dots; cap length.
  const base = path.basename(raw).replace(/[\x00-\x1f]/g, "").replace(/^\.+/, "");
  return base.slice(0, 240) || "upload";
};

const extensionFor = (filename: string, mimetype: string | undefined): string => {
  const fromName = path.extname(filename).toLowerCase().replace(/[^.a-z0-9]/g, "");
  if (fromName) return fromName;
  if (!mimetype) return "";
  // Best-effort common types only — no big mime DB.
  switch (mimetype) {
    case "application/pdf": return ".pdf";
    case "image/png":       return ".png";
    case "image/jpeg":      return ".jpg";
    case "image/webp":      return ".webp";
    case "image/heic":      return ".heic";
    case "image/avif":      return ".avif";
    case "text/csv":        return ".csv";
    case "application/zip": return ".zip";
    default:                return "";
  }
};

const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/zip",
  "application/json",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/avif",
  "text/csv",
  "text/plain",
]);

type AuthContext = { userId: string; tenantId: string };

const requireAuthAndTenant = async (
  req: express.Request,
  deps: Deps,
): Promise<AuthContext> => {
  const bearer = getBearerToken(req.headers.authorization);
  if (!bearer) throw new TRPCError({ code: "UNAUTHORIZED", message: "Missing bearer token." });
  let claims;
  try {
    claims = verifyAccessToken(bearer);
  } catch {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid token." });
  }
  const userId = claims.sub;
  const match = TENANT_PATH_RE.exec(req.originalUrl.split("?")[0] ?? req.originalUrl);
  const tenantId = match?.[1];
  if (!tenantId || !UUID_RE.test(tenantId)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Missing tenantId in URL." });
  }
  const membership = await deps.appDb.withTenant(tenantId, { userId }, (client) =>
    client.query<{ status: string }>(
      "SELECT status FROM core.tenant_member WHERE tenant_id = $1 AND user_id = $2",
      [tenantId, userId],
    ),
  );
  const row = membership.rows[0];
  if (!row || row.status !== "active") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this tenant." });
  }
  return { userId, tenantId };
};

const sendJson = (res: express.Response, status: number, body: unknown) => res.status(status).json(body);

const errorToStatus = (err: TRPCError): number => {
  switch (err.code) {
    case "UNAUTHORIZED":      return 401;
    case "FORBIDDEN":         return 403;
    case "NOT_FOUND":         return 404;
    case "BAD_REQUEST":       return 400;
    case "PAYLOAD_TOO_LARGE": return 413;
    default:                  return 500;
  }
};

export const ensureUploadDirSync = (): string => {
  const root = path.resolve(config.uploadDir);
  fs.mkdirSync(root, { recursive: true });
  return root;
};

export const mountFileRoutes = (app: express.Express, deps: Deps): void => {
  const uploadRoot = ensureUploadDirSync();

  // Multer with on-disk destination decided at request time. We can't compute
  // the final path until we've authenticated, so we save to a per-tenant
  // staging dir then move the file once auth + DB insert succeed.
  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, _file, cb) => {
        // We rely on the route-level auth to have already validated the
        // tenantId in the URL by the time multer runs.
        const match = TENANT_PATH_RE.exec(req.originalUrl.split("?")[0] ?? req.originalUrl);
        const tenantId = match?.[1];
        if (!tenantId || !UUID_RE.test(tenantId)) {
          cb(new Error("Bad tenant"), "");
          return;
        }
        const now = new Date();
        const yyyy = String(now.getUTCFullYear());
        const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
        const dir = path.join(uploadRoot, tenantId, yyyy, mm);
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (_req, file, cb) => {
        const ext = extensionFor(file.originalname, file.mimetype);
        cb(null, `${crypto.randomUUID()}${ext}`);
      },
    }),
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED_MIME.has(file.mimetype)) {
        cb(new Error(`Mimetype not allowed: ${file.mimetype}`));
        return;
      }
      cb(null, true);
    },
  });

  // POST /tenants/:tenantId/files (multipart/form-data, field name "file")
  // Multer's bundled @types/express conflict with the project's; cast to a
  // plain RequestHandler so the type-checker is happy.
  const multerSingleFile = upload.single("file") as unknown as express.RequestHandler;

  const authGate: express.RequestHandler = async (req, res, next) => {
    try {
      await requireAuthAndTenant(req, deps);
      next();
      return;
    } catch (err) {
      if (err instanceof TRPCError) {
        sendJson(res, errorToStatus(err), { ok: false, error: err.message });
        return;
      }
      sendJson(res, 500, { ok: false, error: "Internal error." });
      return;
    }
  };

  app.post(
    "/tenants/:tenantId/files",
    authGate,
    multerSingleFile,
    async (req, res) => {
      const file = req.file;
      if (!file) {
        sendJson(res, 400, { ok: false, error: "Missing file." });
        return;
      }

      try {
        const ctx = await requireAuthAndTenant(req, deps);
        // Compute sha256 of saved file.
        const sha256 = await new Promise<string>((resolve, reject) => {
          const hash = crypto.createHash("sha256");
          const stream = fs.createReadStream(file.path);
          stream.on("data", (chunk) => hash.update(chunk));
          stream.on("end", () => resolve(hash.digest("hex")));
          stream.on("error", reject);
        });

        const sanitisedFilename = sanitiseFilename(file.originalname);
        const relPath = path.relative(uploadRoot, file.path);

        const inserted = await deps.appDb.withTenant(
          ctx.tenantId,
          { userId: ctx.userId },
          (client) =>
            client.query<{ id: string; created_at: string }>(
              `INSERT INTO tax.file (tenant_id, filename, mimetype, path, sha256, size_bytes)
               VALUES (core.current_tenant_id(), $1, $2, $3, $4, $5)
               RETURNING id, created_at`,
              [sanitisedFilename, file.mimetype, relPath, sha256, file.size],
            ),
        );
        const row = inserted.rows[0];
        if (!row) {
          fs.rmSync(file.path, { force: true });
          sendJson(res, 500, { ok: false, error: "Insert returned no row." });
          return;
        }

        sendJson(res, 201, {
          ok: true,
          file: {
            id: row.id,
            filename: sanitisedFilename,
            mimetype: file.mimetype,
            sizeBytes: file.size,
            sha256,
            createdAt: row.created_at,
          },
        });
      } catch (err) {
        // Clean up the saved file if the DB insert / auth failed after multer wrote it.
        if (file.path) fs.rmSync(file.path, { force: true });
        if (err instanceof TRPCError) {
          sendJson(res, errorToStatus(err), { ok: false, error: err.message });
          return;
        }
        console.error("[files.upload]", err);
        sendJson(res, 500, { ok: false, error: "Upload failed." });
      }
    },
  );

  // GET /tenants/:tenantId/files/:id/download
  app.get("/tenants/:tenantId/files/:id/download", async (req, res) => {
    try {
      const ctx = await requireAuthAndTenant(req, deps);
      const fileId = req.params["id"];
      if (!fileId || !UUID_RE.test(fileId)) {
        sendJson(res, 400, { ok: false, error: "Bad file id." });
        return;
      }

      const fileResult = await deps.appDb.withTenant(
        ctx.tenantId,
        { userId: ctx.userId },
        (client) =>
          client.query<{ filename: string; mimetype: string; path: string | null }>(
            "SELECT filename, mimetype, path FROM tax.file WHERE id = $1",
            [fileId],
          ),
      );
      const row = fileResult.rows[0];
      if (!row || !row.path) {
        sendJson(res, 404, { ok: false, error: "Not found." });
        return;
      }

      const absPath = path.resolve(uploadRoot, row.path);
      // Defense in depth — make sure resolved path stays under uploadRoot.
      if (!absPath.startsWith(`${uploadRoot}${path.sep}`)) {
        sendJson(res, 403, { ok: false, error: "Forbidden." });
        return;
      }
      if (!fs.existsSync(absPath)) {
        sendJson(res, 404, { ok: false, error: "File missing on disk." });
        return;
      }

      res.setHeader("Content-Type", row.mimetype);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${row.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
      );
      fs.createReadStream(absPath).pipe(res);
    } catch (err) {
      if (err instanceof TRPCError) {
        sendJson(res, errorToStatus(err), { ok: false, error: err.message });
        return;
      }
      console.error("[files.download]", err);
      sendJson(res, 500, { ok: false, error: "Download failed." });
    }
  });
};
