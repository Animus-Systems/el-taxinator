import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, tenantProcedure } from "../../trpc.js";

const SOURCES = ["csv", "pdf", "wizard", "api"] as const;
const STATUSES = ["pending", "active", "completed", "cancelled"] as const;

const importSchema = z.object({
  id: z.string().uuid(),
  source: z.enum(SOURCES),
  status: z.enum(STATUSES),
  fileName: z.string().nullable(),
  accountId: z.string().uuid().nullable(),
  fileId: z.string().uuid().nullable(),
  columnMapping: z.unknown().nullable(),
  contextFileIds: z.array(z.string().uuid()),
  totalRows: z.number(),
  processedRows: z.number(),
  errorCount: z.number(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

type Row = {
  id: string;
  source: typeof SOURCES[number];
  status: typeof STATUSES[number];
  file_name: string | null;
  account_id: string | null;
  file_id: string | null;
  column_mapping: unknown | null;
  context_file_ids: string[];
  total_rows: number;
  processed_rows: number;
  error_count: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const COLUMNS =
  "id, source, status, file_name, account_id, file_id, column_mapping, "
  + "context_file_ids, total_rows, processed_rows, error_count, notes, created_at, updated_at";

const toApi = (row: Row) => ({
  id: row.id,
  source: row.source,
  status: row.status,
  fileName: row.file_name,
  accountId: row.account_id,
  fileId: row.file_id,
  columnMapping: row.column_mapping,
  contextFileIds: row.context_file_ids,
  totalRows: row.total_rows,
  processedRows: row.processed_rows,
  errorCount: row.error_count,
  notes: row.notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const tenantPathInput = z.object({ tenantId: z.string().uuid() });

export const importsRouter = router({
  list: tenantProcedure
    .meta({ openapi: { method: "GET", path: "/tenants/{tenantId}/imports", tags: ["imports"] } })
    .input(tenantPathInput.extend({ status: z.enum(STATUSES).optional() }))
    .output(z.array(importSchema))
    .query(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        input.status
          ? client.query<Row>(
              `SELECT ${COLUMNS} FROM tax.import_session WHERE status = $1 ORDER BY created_at DESC`,
              [input.status],
            )
          : client.query<Row>(`SELECT ${COLUMNS} FROM tax.import_session ORDER BY created_at DESC`),
      );
      return result.rows.map(toApi);
    }),

  create: tenantProcedure
    .meta({ openapi: { method: "POST", path: "/tenants/{tenantId}/imports", tags: ["imports"] } })
    .input(
      tenantPathInput.extend({
        source: z.enum(SOURCES).default("csv"),
        fileName: z.string().max(500).nullish(),
        accountId: z.string().uuid().nullish(),
        fileId: z.string().uuid().nullish(),
        columnMapping: z.record(z.unknown()).nullish(),
        contextFileIds: z.array(z.string().uuid()).default([]),
        notes: z.string().max(2000).nullish(),
      }),
    )
    .output(importSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<Row>(
          `INSERT INTO tax.import_session
             (tenant_id, source, file_name, account_id, file_id, column_mapping, context_file_ids, notes)
           VALUES (core.current_tenant_id(), $1, $2, $3, $4, $5::jsonb, $6, $7)
           RETURNING ${COLUMNS}`,
          [
            input.source,
            input.fileName ?? null,
            input.accountId ?? null,
            input.fileId ?? null,
            input.columnMapping ? JSON.stringify(input.columnMapping) : null,
            input.contextFileIds,
            input.notes ?? null,
          ],
        ),
      );
      const row = result.rows[0];
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return toApi(row);
    }),

  setStatus: tenantProcedure
    .meta({
      openapi: { method: "PATCH", path: "/tenants/{tenantId}/imports/{id}/status", tags: ["imports"] },
    })
    .input(tenantPathInput.extend({ id: z.string().uuid(), status: z.enum(STATUSES) }))
    .output(importSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<Row>(
          `UPDATE tax.import_session SET status = $2 WHERE id = $1 RETURNING ${COLUMNS}`,
          [input.id, input.status],
        ),
      );
      const row = result.rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return toApi(row);
    }),

  delete: tenantProcedure
    .meta({ openapi: { method: "DELETE", path: "/tenants/{tenantId}/imports/{id}", tags: ["imports"] } })
    .input(tenantPathInput.extend({ id: z.string().uuid() }))
    .output(z.object({ ok: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query("DELETE FROM tax.import_session WHERE id = $1 RETURNING id", [input.id]),
      );
      if (!result.rowCount) throw new TRPCError({ code: "NOT_FOUND" });
      return { ok: true as const };
    }),
});
