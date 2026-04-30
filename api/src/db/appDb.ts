import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import { appAdminPool, appPool } from "./pool.js";

export type PgClient = PoolClient;

export type TenantDbContext = {
  userId?: string | null | undefined;
  projectId?: string | null | undefined;
  workerId?: string | null | undefined;
};

const getAdminPool = (): Pool => {
  if (!appAdminPool) {
    throw new Error("APP_DB_ADMIN_URL not configured (admin operation unavailable).");
  }
  return appAdminPool;
};

export const appDb = {
  query: <T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []) =>
    appPool.query<T>(sql, params),
  adminQuery: <T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []) =>
    getAdminPool().query<T>(sql, params),
  withTenant: async <T>(
    tenantId: string,
    ctxOrFn: TenantDbContext | ((client: PgClient) => Promise<T>),
    maybeFn?: (client: PgClient) => Promise<T>,
  ): Promise<T> => {
    const ctx: TenantDbContext = typeof ctxOrFn === "function" ? {} : ctxOrFn;
    const fn: (client: PgClient) => Promise<T> =
      typeof ctxOrFn === "function" ? ctxOrFn : (maybeFn as (client: PgClient) => Promise<T>);

    const client = await appPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      if (ctx.userId) {
        await client.query("SELECT set_config('app.user_id', $1, true)", [ctx.userId]);
        await client.query("SELECT set_config('app.enforce_project_rls', '1', true)");
      }
      if (ctx.projectId) await client.query("SELECT set_config('app.project_id', $1, true)", [ctx.projectId]);
      if (ctx.workerId) await client.query("SELECT set_config('app.worker_id', $1, true)", [ctx.workerId]);
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  },
  withTenantAdmin: async <T>(
    tenantId: string,
    ctxOrFn: TenantDbContext | ((client: PgClient) => Promise<T>),
    maybeFn?: (client: PgClient) => Promise<T>,
  ): Promise<T> => {
    const ctx: TenantDbContext = typeof ctxOrFn === "function" ? {} : ctxOrFn;
    const fn: (client: PgClient) => Promise<T> =
      typeof ctxOrFn === "function" ? ctxOrFn : (maybeFn as (client: PgClient) => Promise<T>);

    const pool = getAdminPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      if (ctx.userId) {
        await client.query("SELECT set_config('app.user_id', $1, true)", [ctx.userId]);
        await client.query("SELECT set_config('app.enforce_project_rls', '1', true)");
      }
      if (ctx.projectId) await client.query("SELECT set_config('app.project_id', $1, true)", [ctx.projectId]);
      if (ctx.workerId) await client.query("SELECT set_config('app.worker_id', $1, true)", [ctx.workerId]);
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  },
  withAdmin: async <T>(fn: (client: PgClient) => Promise<T>): Promise<T> => {
    const pool = getAdminPool();
    const client = await pool.connect();
    try {
      const result = await fn(client);
      return result;
    } finally {
      client.release();
    }
  },
};

export const toRow = <T extends QueryResultRow>(result: QueryResult<T>): T => {
  const row = result.rows[0];
  if (!row) throw new Error("Expected one row, got none.");
  return row;
};
