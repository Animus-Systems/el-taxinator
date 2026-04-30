import crypto from "node:crypto";
import type { QueryResultRow } from "pg";
import { randomToken, sha256Base64Url } from "./http.js";

type Queryer = {
  query: <T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: T[] }>;
};

type StoredRefreshPayload = {
  token_hash: string;
  version: 1;
};

const REFRESH_MODEL = "RefreshToken";

const makeRefreshToken = (): { id: string; secret: string; token: string } => {
  const id = randomToken(16);
  const secret = randomToken(32);
  return { id, secret, token: `${id}.${secret}` };
};

export const issueRefreshToken = async (
  db: Queryer,
  userId: string,
  ttlSeconds: number,
): Promise<{ refreshToken: string; grantId: string }> => {
  const grantId = randomToken(18);
  const { id, secret, token } = makeRefreshToken();
  const payload: StoredRefreshPayload = { token_hash: sha256Base64Url(secret), version: 1 };

  const expiresAtIso = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  await db.query(
    "INSERT INTO oidc.store(model,id,payload,expires_at,user_id,grant_id) VALUES ($1,$2,$3,$4,$5,$6)",
    [REFRESH_MODEL, id, payload, expiresAtIso, userId, grantId],
  );

  return { refreshToken: token, grantId };
};

type RotateResult =
  | { ok: true; userId: string; refreshToken: string; grantId: string }
  | { ok: false; reason: "INVALID" | "EXPIRED" | "CONSUMED" | "MISMATCH" | "REUSED" };

export const rotateRefreshToken = async (
  identityDb: { withTx: <T>(fn: (client: Queryer) => Promise<T>) => Promise<T> },
  providedToken: string,
  ttlSeconds: number,
  meta: { ip?: string; userAgent?: string },
): Promise<RotateResult> => {
  const [id, secret] = providedToken.split(".");
  if (!id || !secret) return { ok: false, reason: "INVALID" };

  const expectedHash = sha256Base64Url(secret);
  const expectedHashBytes = Buffer.from(expectedHash, "base64url");

  return identityDb.withTx(async (client) => {
    const existing = await client.query<{
      payload: StoredRefreshPayload;
      expires_at: string;
      consumed_at: string | null;
      user_id: string | null;
      grant_id: string | null;
    }>(
      "SELECT payload,expires_at,consumed_at,user_id,grant_id FROM oidc.store WHERE model=$1 AND id=$2 FOR UPDATE",
      [REFRESH_MODEL, id],
    );

    const row = existing.rows[0];
    if (!row || !row.user_id || !row.grant_id) return { ok: false as const, reason: "INVALID" };
    if (new Date(row.expires_at).getTime() <= Date.now()) return { ok: false as const, reason: "EXPIRED" };

    if (row.consumed_at) {
      await client.query(
        "INSERT INTO iam.security_event(event_type,user_id,ip,user_agent,meta) VALUES ('REFRESH_TOKEN_REUSE',$1,$2,$3,$4)",
        [row.user_id, meta.ip ?? null, meta.userAgent ?? null, { grant_id: row.grant_id, token_id: id }],
      );
      await client.query("DELETE FROM oidc.store WHERE model=$1 AND grant_id=$2", [REFRESH_MODEL, row.grant_id]);
      return { ok: false as const, reason: "REUSED" };
    }

    const payloadHash = row.payload?.token_hash;
    if (typeof payloadHash !== "string" || !payloadHash) return { ok: false as const, reason: "MISMATCH" };
    const payloadHashBytes = Buffer.from(payloadHash, "base64url");
    if (payloadHashBytes.length !== expectedHashBytes.length) return { ok: false as const, reason: "MISMATCH" };
    if (!crypto.timingSafeEqual(payloadHashBytes, expectedHashBytes)) {
      return { ok: false as const, reason: "MISMATCH" };
    }

    await client.query(
      "UPDATE oidc.store SET consumed_at=now() WHERE model=$1 AND id=$2 AND consumed_at IS NULL",
      [REFRESH_MODEL, id],
    );

    const next = makeRefreshToken();
    const nextPayload: StoredRefreshPayload = { token_hash: sha256Base64Url(next.secret), version: 1 };
    const expiresAtIso = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    await client.query(
      "INSERT INTO oidc.store(model,id,payload,expires_at,user_id,grant_id) VALUES ($1,$2,$3,$4,$5,$6)",
      [REFRESH_MODEL, next.id, nextPayload, expiresAtIso, row.user_id, row.grant_id],
    );

    return { ok: true as const, userId: row.user_id, refreshToken: next.token, grantId: row.grant_id };
  });
};

export const revokeRefreshToken = async (
  identityDb: Queryer,
  providedToken: string,
): Promise<void> => {
  const [id] = providedToken.split(".");
  if (!id) return;
  await identityDb.query("DELETE FROM oidc.store WHERE model=$1 AND id=$2", [REFRESH_MODEL, id]);
};
