import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, tenantProcedure } from "../../trpc.js";

// Phase 3 covers file metadata only. The on-disk upload handler (multer +
// sanitised paths under UPLOAD_DIR/<tenantId>/...) lands in Phase 4. The
// `path` column is kept nullable in the schema because Phase 5+ will allow
// CID-only rows once content-addressed storage replaces local disk.

const fileSchema = z.object({
  id: z.string().uuid(),
  filename: z.string(),
  path: z.string().nullable(),
  cid: z.string().nullable(),
  mimetype: z.string(),
  sha256: z.string().nullable(),
  sizeBytes: z.number().int().nullable(),
  metadata: z.unknown().nullable(),
  isReviewed: z.boolean(),
  isSplitted: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

type Row = {
  id: string;
  filename: string;
  path: string | null;
  cid: string | null;
  mimetype: string;
  sha256: string | null;
  size_bytes: string | null;
  metadata: unknown | null;
  is_reviewed: boolean;
  is_splitted: boolean;
  created_at: string;
  updated_at: string;
};

const COLUMNS =
  "id, filename, path, cid, mimetype, sha256, size_bytes, metadata, is_reviewed, is_splitted, created_at, updated_at";

const toApi = (row: Row) => ({
  id: row.id,
  filename: row.filename,
  path: row.path,
  cid: row.cid,
  mimetype: row.mimetype,
  sha256: row.sha256,
  sizeBytes: row.size_bytes === null ? null : Number.parseInt(row.size_bytes, 10),
  metadata: row.metadata,
  isReviewed: row.is_reviewed,
  isSplitted: row.is_splitted,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const tenantPathInput = z.object({ tenantId: z.string().uuid() });

export const filesRouter = router({
  list: tenantProcedure
    .meta({ openapi: { method: "GET", path: "/tenants/{tenantId}/files", tags: ["files"] } })
    .input(
      tenantPathInput.extend({
        reviewed: z.boolean().optional(),
        limit: z.number().int().min(1).max(500).default(100),
      }),
    )
    .output(z.array(fileSchema))
    .query(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        input.reviewed === undefined
          ? client.query<Row>(
              `SELECT ${COLUMNS} FROM tax.file ORDER BY created_at DESC LIMIT $1`,
              [input.limit],
            )
          : client.query<Row>(
              `SELECT ${COLUMNS} FROM tax.file WHERE is_reviewed = $1 ORDER BY created_at DESC LIMIT $2`,
              [input.reviewed, input.limit],
            ),
      );
      return result.rows.map(toApi);
    }),

  // Stub creator: lets Phase 3 smoke-test isolation without the upload handler.
  // The real path is set by Phase 4's POST /tenants/:tenantId/files with multer.
  createMetadata: tenantProcedure
    .meta({ openapi: { method: "POST", path: "/tenants/{tenantId}/files", tags: ["files"] } })
    .input(
      tenantPathInput.extend({
        filename: z.string().min(1).max(500),
        mimetype: z.string().min(1).max(200),
        path: z.string().min(1).max(2000),
        sha256: z.string().regex(/^[a-f0-9]{64}$/).nullish(),
        sizeBytes: z.number().int().nonnegative().nullish(),
        metadata: z.record(z.unknown()).nullish(),
      }),
    )
    .output(fileSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<Row>(
          `INSERT INTO tax.file
             (tenant_id, filename, mimetype, path, sha256, size_bytes, metadata)
           VALUES (core.current_tenant_id(), $1, $2, $3, $4, $5, $6)
           RETURNING ${COLUMNS}`,
          [
            input.filename,
            input.mimetype,
            input.path,
            input.sha256 ?? null,
            input.sizeBytes ?? null,
            input.metadata ?? null,
          ],
        ),
      );
      const row = result.rows[0];
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return toApi(row);
    }),

  setReviewed: tenantProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: "/tenants/{tenantId}/files/{id}/reviewed",
        tags: ["files"],
      },
    })
    .input(tenantPathInput.extend({ id: z.string().uuid(), isReviewed: z.boolean() }))
    .output(fileSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<Row>(
          `UPDATE tax.file SET is_reviewed = $2 WHERE id = $1 RETURNING ${COLUMNS}`,
          [input.id, input.isReviewed],
        ),
      );
      const row = result.rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return toApi(row);
    }),

  delete: tenantProcedure
    .meta({ openapi: { method: "DELETE", path: "/tenants/{tenantId}/files/{id}", tags: ["files"] } })
    .input(tenantPathInput.extend({ id: z.string().uuid() }))
    .output(z.object({ ok: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query("DELETE FROM tax.file WHERE id = $1 RETURNING id", [input.id]),
      );
      if (!result.rowCount) throw new TRPCError({ code: "NOT_FOUND" });
      return { ok: true as const };
    }),
});
