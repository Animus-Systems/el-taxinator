import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, tenantProcedure } from "../../trpc.js";

const ROLES = ["client", "supplier", "both"] as const;
const KINDS = ["company", "person"] as const;

const contactSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  mobile: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  postalCode: z.string().nullable(),
  province: z.string().nullable(),
  country: z.string().nullable(),
  taxId: z.string().nullable(),
  bankDetails: z.string().nullable(),
  notes: z.string().nullable(),
  role: z.enum(ROLES),
  kind: z.enum(KINDS),
  createdAt: z.string(),
  updatedAt: z.string(),
});

type Row = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  province: string | null;
  country: string | null;
  tax_id: string | null;
  bank_details: string | null;
  notes: string | null;
  role: typeof ROLES[number];
  kind: typeof KINDS[number];
  created_at: string;
  updated_at: string;
};

const COLUMNS =
  "id, name, email::text AS email, phone, mobile, address, city, postal_code, province, country, tax_id, bank_details, notes, role, kind, created_at, updated_at";

const toApi = (row: Row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  phone: row.phone,
  mobile: row.mobile,
  address: row.address,
  city: row.city,
  postalCode: row.postal_code,
  province: row.province,
  country: row.country,
  taxId: row.tax_id,
  bankDetails: row.bank_details,
  notes: row.notes,
  role: row.role,
  kind: row.kind,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const tenantPathInput = z.object({ tenantId: z.string().uuid() });

const filterSchema = tenantPathInput.extend({
  role: z.enum(ROLES).optional(),
});

export const contactsRouter = router({
  list: tenantProcedure
    .meta({ openapi: { method: "GET", path: "/tenants/{tenantId}/contacts", tags: ["contacts"] } })
    .input(filterSchema)
    .output(z.array(contactSchema))
    .query(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        input.role
          ? client.query<Row>(
              `SELECT ${COLUMNS} FROM tax.contact WHERE role = $1 OR role = 'both' ORDER BY lower(name) ASC`,
              [input.role],
            )
          : client.query<Row>(`SELECT ${COLUMNS} FROM tax.contact ORDER BY lower(name) ASC`),
      );
      return result.rows.map(toApi);
    }),

  create: tenantProcedure
    .meta({ openapi: { method: "POST", path: "/tenants/{tenantId}/contacts", tags: ["contacts"] } })
    .input(
      tenantPathInput.extend({
        name: z.string().min(1).max(200),
        email: z.string().email().nullish(),
        phone: z.string().max(64).nullish(),
        mobile: z.string().max(64).nullish(),
        address: z.string().max(500).nullish(),
        city: z.string().max(120).nullish(),
        postalCode: z.string().max(40).nullish(),
        province: z.string().max(120).nullish(),
        country: z.string().max(120).nullish(),
        taxId: z.string().max(80).nullish(),
        bankDetails: z.string().max(2000).nullish(),
        notes: z.string().max(2000).nullish(),
        role: z.enum(ROLES).default("client"),
        kind: z.enum(KINDS).default("company"),
      }),
    )
    .output(contactSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<Row>(
          `INSERT INTO tax.contact
             (tenant_id, name, email, phone, mobile, address, city, postal_code, province, country, tax_id, bank_details, notes, role, kind)
           VALUES (core.current_tenant_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           RETURNING ${COLUMNS}`,
          [
            input.name,
            input.email ?? null,
            input.phone ?? null,
            input.mobile ?? null,
            input.address ?? null,
            input.city ?? null,
            input.postalCode ?? null,
            input.province ?? null,
            input.country ?? null,
            input.taxId ?? null,
            input.bankDetails ?? null,
            input.notes ?? null,
            input.role,
            input.kind,
          ],
        ),
      );
      const row = result.rows[0];
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return toApi(row);
    }),

  update: tenantProcedure
    .meta({ openapi: { method: "PATCH", path: "/tenants/{tenantId}/contacts/{id}", tags: ["contacts"] } })
    .input(
      tenantPathInput.extend({
        id: z.string().uuid(),
        name: z.string().min(1).max(200).optional(),
        email: z.string().email().nullish(),
        phone: z.string().max(64).nullish(),
        mobile: z.string().max(64).nullish(),
        address: z.string().max(500).nullish(),
        city: z.string().max(120).nullish(),
        postalCode: z.string().max(40).nullish(),
        province: z.string().max(120).nullish(),
        country: z.string().max(120).nullish(),
        taxId: z.string().max(80).nullish(),
        bankDetails: z.string().max(2000).nullish(),
        notes: z.string().max(2000).nullish(),
        role: z.enum(ROLES).optional(),
        kind: z.enum(KINDS).optional(),
      }),
    )
    .output(contactSchema)
    .mutation(async ({ ctx, input }) => {
      // Generic "set this column when the JSON had the key" pattern. The
      // boolean flag for each nullable column mirrors `prop !== undefined`,
      // letting null clear the value while undefined keeps the existing one.
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<Row>(
          `UPDATE tax.contact SET
             name         = COALESCE($2, name),
             email        = CASE WHEN $3::boolean  THEN $4  ELSE email END,
             phone        = CASE WHEN $5::boolean  THEN $6  ELSE phone END,
             mobile       = CASE WHEN $7::boolean  THEN $8  ELSE mobile END,
             address      = CASE WHEN $9::boolean  THEN $10 ELSE address END,
             city         = CASE WHEN $11::boolean THEN $12 ELSE city END,
             postal_code  = CASE WHEN $13::boolean THEN $14 ELSE postal_code END,
             province     = CASE WHEN $15::boolean THEN $16 ELSE province END,
             country      = CASE WHEN $17::boolean THEN $18 ELSE country END,
             tax_id       = CASE WHEN $19::boolean THEN $20 ELSE tax_id END,
             bank_details = CASE WHEN $21::boolean THEN $22 ELSE bank_details END,
             notes        = CASE WHEN $23::boolean THEN $24 ELSE notes END,
             role         = COALESCE($25, role),
             kind         = COALESCE($26, kind)
           WHERE id = $1
           RETURNING ${COLUMNS}`,
          [
            input.id,
            input.name ?? null,
            input.email !== undefined,        input.email ?? null,
            input.phone !== undefined,        input.phone ?? null,
            input.mobile !== undefined,       input.mobile ?? null,
            input.address !== undefined,      input.address ?? null,
            input.city !== undefined,         input.city ?? null,
            input.postalCode !== undefined,   input.postalCode ?? null,
            input.province !== undefined,     input.province ?? null,
            input.country !== undefined,      input.country ?? null,
            input.taxId !== undefined,        input.taxId ?? null,
            input.bankDetails !== undefined,  input.bankDetails ?? null,
            input.notes !== undefined,        input.notes ?? null,
            input.role ?? null,
            input.kind ?? null,
          ],
        ),
      );
      const row = result.rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return toApi(row);
    }),

  delete: tenantProcedure
    .meta({ openapi: { method: "DELETE", path: "/tenants/{tenantId}/contacts/{id}", tags: ["contacts"] } })
    .input(tenantPathInput.extend({ id: z.string().uuid() }))
    .output(z.object({ ok: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query("DELETE FROM tax.contact WHERE id = $1 RETURNING id", [input.id]),
      );
      if (!result.rowCount) throw new TRPCError({ code: "NOT_FOUND" });
      return { ok: true as const };
    }),
});
