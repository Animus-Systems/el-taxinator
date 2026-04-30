import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import { identityAdminPool, identityPool } from "./pool.js";

export type PgClient = PoolClient;

const getAdminPool = (): Pool => {
  if (!identityAdminPool) {
    throw new Error("IDENTITY_DB_ADMIN_URL not configured (admin operation unavailable).");
  }
  return identityAdminPool;
};

export const identityDb = {
  query: <T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []) =>
    identityPool.query<T>(sql, params),
  adminQuery: <T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []) =>
    getAdminPool().query<T>(sql, params),
  withTx: async <T>(fn: (client: PgClient) => Promise<T>): Promise<T> => {
    const client = await identityPool.connect();
    try {
      await client.query("BEGIN");
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
