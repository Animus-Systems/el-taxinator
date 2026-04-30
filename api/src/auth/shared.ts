import { randomInt } from "node:crypto";
import type express from "express";
import { TRPCError } from "@trpc/server";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/types";
import { authenticator } from "otplib";
import { z } from "zod";
import { config } from "../config.js";
import type { identityDb as identityDbType } from "../db/identityDb.js";
import { appAdminPool } from "../db/pool.js";
import { getBearerToken, signAccessToken, verifyAccessToken } from "./jwt.js";
import { getRequestOrigin, parseCookies, randomToken, serializeCookie, sha256Base64Url } from "./http.js";
import { isAllowedOrigin } from "./origin.js";
import { issueRefreshToken } from "./refreshTokens.js";
import { requeueOutboxEvent } from "../utils/outbox.js";

export type IdentityDb = typeof identityDbType;

export const json = (res: express.Response, status: number, body: unknown) => res.status(status).json(body);
export const shouldExposeDevCodes = !config.isProd && config.authExposeDevCodes;
export const PHONE_E164_REGEX = /^\+[1-9]\d{6,14}$/;
export const TOTP_CODE_PATTERN = /^\d{6}$/;
export const AUTH_EMAIL_VERIFICATION_REUSE_WINDOW_SECONDS = (() => {
  const parsed = Number.parseInt(process.env["AUTH_EMAIL_VERIFICATION_REUSE_WINDOW_SECONDS"] ?? "300", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 300;
})();

authenticator.options = {
  window: 1,
  step: 30,
};

export type MfaMethod = "authenticator_app" | "passkey";
export type MfaRequiredGroup =
  | "global_admins"
  | "tenant_admins"
  | "domain_admins"
  | "providers"
  | "suppliers"
  | "place_editors"
  | "customers";

export type ResolvedMfaPolicy = {
  required: boolean;
  allowedMethods: MfaMethod[];
  matchedTenants: string[];
};

export type LoginChallengePayload = {
  user_id: string;
  email: string | null;
  email_verified: boolean;
  allowed_methods: MfaMethod[];
  passkey_challenge?: string;
};

export type TotpSetupChallengePayload = {
  user_id: string;
  secret_base32: string;
  issuer: string;
  label: string;
};

export type PasskeySetupChallengePayload = {
  user_id: string;
  expected_challenge: string;
  label?: string | null;
};

export const MFA_METHODS: readonly MfaMethod[] = ["authenticator_app", "passkey"];

export const normalizeMfaMethod = (value: unknown): MfaMethod | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "authenticator_app" || normalized === "totp" || normalized === "auth_app") {
    return "authenticator_app";
  }
  if (normalized === "passkey") return "passkey";
  return null;
};

export const normalizeMfaRequiredGroup = (value: unknown): MfaRequiredGroup | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case "global_admins":
      return "global_admins";
    case "tenant_admins":
      return "tenant_admins";
    case "domain_admins":
      return "domain_admins";
    case "providers":
      return "providers";
    case "suppliers":
      return "suppliers";
    case "place_editors":
      return "place_editors";
    case "customers":
      return "customers";
    default:
      return null;
  }
};

export const normalizeTenantRole = (value: unknown): string =>
  (typeof value === "string" ? value.trim().toLowerCase() : "");

export const roleToMfaGroups = (role: string): MfaRequiredGroup[] => {
  switch (role) {
    case "platform_admin":
    case "global_admin":
      return ["global_admins", "tenant_admins"];
    case "admin":
      return ["tenant_admins"];
    case "domain_admin":
      return ["domain_admins"];
    case "provider":
      return ["providers"];
    case "supplier":
      return ["suppliers"];
    case "place_editor":
      return ["place_editors"];
    case "customer":
      return ["customers"];
    default:
      return [];
  }
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

export const isAuthenticationResponseJson = (value: unknown): value is AuthenticationResponseJSON => {
  if (!isRecord(value) || !isRecord(value["response"]) || !isRecord(value["clientExtensionResults"])) {
    return false;
  }
  return (
    typeof value["id"] === "string"
    && typeof value["rawId"] === "string"
    && value["type"] === "public-key"
    && typeof value["response"]["clientDataJSON"] === "string"
    && typeof value["response"]["authenticatorData"] === "string"
    && typeof value["response"]["signature"] === "string"
    && (value["response"]["userHandle"] === undefined || typeof value["response"]["userHandle"] === "string")
  );
};

export const isRegistrationResponseJson = (value: unknown): value is RegistrationResponseJSON => {
  if (!isRecord(value) || !isRecord(value["response"]) || !isRecord(value["clientExtensionResults"])) {
    return false;
  }
  return (
    typeof value["id"] === "string"
    && typeof value["rawId"] === "string"
    && value["type"] === "public-key"
    && typeof value["response"]["clientDataJSON"] === "string"
    && typeof value["response"]["attestationObject"] === "string"
    && (value["response"]["authenticatorData"] === undefined || typeof value["response"]["authenticatorData"] === "string")
    && (value["response"]["publicKey"] === undefined || typeof value["response"]["publicKey"] === "string")
  );
};

export const serializePasskeyAuthenticationOptions = (
  options: PublicKeyCredentialRequestOptionsJSON,
): Record<string, unknown> => JSON.parse(JSON.stringify(options)) as Record<string, unknown>;

export const parseAllowedMethods = (value: unknown): MfaMethod[] => {
  const methods = asStringArray(value)
    .map((entry) => normalizeMfaMethod(entry))
    .filter((entry): entry is MfaMethod => Boolean(entry));
  return methods.length > 0 ? Array.from(new Set(methods)) : [...MFA_METHODS];
};

export const parseRequiredGroups = (value: unknown): MfaRequiredGroup[] => {
  const groups = asStringArray(value)
    .map((entry) => normalizeMfaRequiredGroup(entry))
    .filter((entry): entry is MfaRequiredGroup => Boolean(entry));
  return groups.length > 0 ? Array.from(new Set(groups)) : ["tenant_admins", "global_admins"];
};

export const resolveMfaPolicyForUser = async (userId: string): Promise<ResolvedMfaPolicy> => {
  if (!appAdminPool) {
    return { required: false, allowedMethods: [...MFA_METHODS], matchedTenants: [] };
  }

  const { rows } = await appAdminPool.query<{
    tenant_id: string;
    role: string;
    value_json: unknown;
  }>(
    "SELECT tm.tenant_id,tm.role,tc.value_json "
      + "FROM core.tenant_member tm "
      + "LEFT JOIN core.tenant_config tc ON tc.tenant_id=tm.tenant_id "
      + "WHERE tm.user_id=$1 AND tm.status='active'",
    [userId],
  );

  if (!rows.length) return { required: false, allowedMethods: [...MFA_METHODS], matchedTenants: [] };

  const matchedTenants: string[] = [];
  const allowedMethods = new Set<MfaMethod>();

  for (const row of rows) {
    const role = normalizeTenantRole(row.role);
    const roleGroups = roleToMfaGroups(role);
    if (!roleGroups.length) continue;

    const valueJson = isRecord(row.value_json) ? row.value_json : {};
    const authRoot = isRecord(valueJson["auth"]) ? valueJson["auth"] : null;
    const policyRoot = isRecord(authRoot?.["policy"]) ? authRoot["policy"] : authRoot;
    if (!isRecord(policyRoot)) continue;
    if (policyRoot["enforcement_enabled"] !== true) continue;

    const requiredGroups = parseRequiredGroups(policyRoot["required_groups"]);
    if (!roleGroups.some((group) => requiredGroups.includes(group))) continue;

    matchedTenants.push(row.tenant_id);
    for (const method of parseAllowedMethods(policyRoot["allowed_methods"])) {
      allowedMethods.add(method);
    }
  }

  if (!matchedTenants.length) {
    return { required: false, allowedMethods: [...MFA_METHODS], matchedTenants: [] };
  }

  return {
    required: true,
    allowedMethods: Array.from(allowedMethods.size ? allowedMethods : new Set(MFA_METHODS)),
    matchedTenants: Array.from(new Set(matchedTenants)),
  };
};

export const requireTotpCode = (value: string): string => {
  const normalized = value.trim().replace(/\s+/g, "");
  if (!TOTP_CODE_PATTERN.test(normalized)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Authenticator code must be a 6-digit value." });
  }
  return normalized;
};

export const upsertChallenge = async (
  client: { query: IdentityDb["query"] },
  args: {
    userId: string;
    challengeType: "login" | "login_passkey" | "totp_setup" | "passkey_setup";
    payload: unknown;
    maxAttempts?: number;
    ttlSeconds: number;
  },
): Promise<{ token: string }> => {
  const token = randomToken(40);
  const tokenHash = sha256Base64Url(token);
  const expiresAt = new Date(Date.now() + args.ttlSeconds * 1000).toISOString();
  await client.query(
    "INSERT INTO iam.mfa_challenge(user_id,challenge_type,token_hash,payload,max_attempts,expires_at) "
      + "VALUES ($1,$2,$3,$4,$5,$6)",
    [args.userId, args.challengeType, tokenHash, args.payload, args.maxAttempts ?? 10, expiresAt],
  );
  return { token };
};

export const loadChallengeForUpdate = async (
  client: { query: IdentityDb["query"] },
  args: {
    token: string;
    expectedTypes: Array<"login" | "login_passkey" | "totp_setup" | "passkey_setup">;
  },
): Promise<{
    id: string;
    user_id: string;
    challenge_type: "login" | "login_passkey" | "totp_setup" | "passkey_setup";
    payload: unknown;
    attempt_count: number;
    max_attempts: number;
    expires_at: string;
    used_at: string | null;
  }> => {
  const tokenHash = sha256Base64Url(args.token);
  const result = await client.query<{
    id: string;
    user_id: string;
    challenge_type: "login" | "login_passkey" | "totp_setup" | "passkey_setup";
    payload: unknown;
    attempt_count: number;
    max_attempts: number;
    expires_at: string;
    used_at: string | null;
  }>(
    "SELECT id,user_id,challenge_type,payload,attempt_count,max_attempts,expires_at,used_at "
      + "FROM iam.mfa_challenge WHERE token_hash=$1 FOR UPDATE",
    [tokenHash],
  );
  const row = result.rows[0];
  if (!row) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid MFA challenge." });
  if (!args.expectedTypes.includes(row.challenge_type)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "MFA challenge type mismatch." });
  }
  if (row.used_at) throw new TRPCError({ code: "BAD_REQUEST", message: "MFA challenge already consumed." });
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "MFA challenge expired." });
  }
  if (row.attempt_count >= row.max_attempts) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many MFA attempts." });
  }
  return row;
};

export const incrementChallengeAttempt = async (
  client: { query: IdentityDb["query"] },
  challengeId: string,
): Promise<void> => {
  await client.query(
    "UPDATE iam.mfa_challenge SET attempt_count=attempt_count+1 WHERE id=$1",
    [challengeId],
  );
};

export const markChallengeUsed = async (
  client: { query: IdentityDb["query"] },
  challengeId: string,
): Promise<void> => {
  await client.query(
    "UPDATE iam.mfa_challenge SET used_at=now(), attempt_count=attempt_count+1 WHERE id=$1",
    [challengeId],
  );
};

export const issueSessionForUser = async (
  client: { query: IdentityDb["query"] },
  user: { id: string; email: string | null; email_verified: boolean },
): Promise<{ userId: string; accessToken: string; refreshToken: string; csrfToken: string }> => {
  const { refreshToken } = await issueRefreshToken(client, user.id, config.refreshTokenTtlSeconds);
  const csrfToken = randomToken(18);
  return {
    userId: user.id,
    accessToken: signAccessToken({ sub: user.id, email: user.email, email_verified: user.email_verified }),
    refreshToken,
    csrfToken,
  };
};

export const toBase64Url = (value: Uint8Array): string => Buffer.from(value).toString("base64url");
export const fromBase64Url = (value: string): Uint8Array => Uint8Array.from(Buffer.from(value, "base64url"));

export const normalizeTransportList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
};
export const mapPasskeyVerificationErrorMessage = (
  error: unknown,
  mode: "setup" | "login",
): string => {
  const rawMessage = error instanceof Error ? error.message.trim() : "";
  const lowered = rawMessage.toLowerCase();
  if (
    lowered.includes("challenge")
    || lowered.includes("expired")
    || lowered.includes("mismatch")
  ) {
    return mode === "setup"
      ? "Passkey setup challenge expired or mismatched. Start setup again."
      : "Passkey challenge expired or mismatched. Start sign-in again.";
  }
  if (
    lowered.includes("origin")
    || lowered.includes("rp id")
    || lowered.includes("rpid")
  ) {
    return "Passkey verification failed due to origin or RP ID mismatch. Check PASSKEY_RP_ID and PASSKEY_EXPECTED_ORIGINS.";
  }
  if (lowered.includes("user verification")) {
    return mode === "setup"
      ? "Passkey setup requires user verification. Unlock your authenticator and try again."
      : "Passkey verification requires user verification. Unlock your authenticator and try again.";
  }
  return mode === "setup"
    ? "Passkey setup could not be verified."
    : "Passkey verification failed.";
};

export const parseLoginChallengePayload = (payload: unknown): LoginChallengePayload => {
  if (!isRecord(payload)) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid MFA challenge payload." });
  const userId = typeof payload["user_id"] === "string" ? payload["user_id"] : null;
  const email = typeof payload["email"] === "string" || payload["email"] === null ? payload["email"] : null;
  const emailVerified = payload["email_verified"] === true;
  const allowedMethods = parseAllowedMethods(payload["allowed_methods"]);
  if (!userId) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid MFA challenge payload." });
  return {
    user_id: userId,
    email,
    email_verified: emailVerified,
    allowed_methods: allowedMethods,
    ...(typeof payload["passkey_challenge"] === "string" ? { passkey_challenge: payload["passkey_challenge"] } : {}),
  };
};

export const applyPendingTenantInvitesForVerifiedEmail = async (args: {
  userId: string;
  email: string | null;
}): Promise<void> => {
  if (!appAdminPool) return;
  const normalizedEmail = args.email?.trim().toLowerCase();
  if (!normalizedEmail) return;

  const client = await appAdminPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT core.ensure_user_exists($1)", [args.userId]);
    await client.query(
      "WITH pending AS ("
        + "  SELECT id,tenant_id,invited_by,role "
        + "  FROM core.tenant_invite "
        + "  WHERE lower(email)=lower($2) "
        + "    AND accepted_at IS NULL "
        + "    AND revoked_at IS NULL "
        + "    AND expires_at > now() "
        + "  FOR UPDATE"
        + "), inserted AS ("
        + "  INSERT INTO core.tenant_member(tenant_id,user_id,role,status,invited_by) "
        + "  SELECT p.tenant_id,$1,p.role,'active',p.invited_by "
        + "  FROM pending p "
        + "  ON CONFLICT (tenant_id,user_id) DO UPDATE SET "
        + "    role=CASE "
        + "      WHEN lower(core.tenant_member.role)='customer' "
        + "       AND lower(EXCLUDED.role)<>'customer' "
        + "      THEN EXCLUDED.role "
        + "      ELSE core.tenant_member.role "
        + "    END, "
        + "    status='active', "
        + "    invited_by=COALESCE(EXCLUDED.invited_by, core.tenant_member.invited_by), "
        + "    updated_at=now()"
        + ") "
        + "UPDATE core.tenant_invite ti "
        + "SET accepted_at=now(), revoked_at=NULL "
        + "WHERE ti.id IN (SELECT id FROM pending)",
      [args.userId, normalizedEmail],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// Idempotently provision a personal tenant for the user (entity_type='individual')
// with the user as 'owner'. Called from register/verify/login/oauth-callback so a
// user's first authenticated step always lands in app_db with at least one
// membership. Business tenants (autonomo / sl) are created later via
// `tenants.create`. Slug derived from the user UUID is deterministic and never
// collides; tenant.slug uniqueness keeps repeated calls safe.
export const ensurePersonalTenantForUser = async (args: {
  userId: string;
}): Promise<void> => {
  if (!appAdminPool) return;
  const client = await appAdminPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT core.ensure_user_exists($1)", [args.userId]);

    const existing = await client.query<{ id: string }>(
      "SELECT t.id FROM core.tenant t "
        + "JOIN core.tenant_member tm ON tm.tenant_id = t.id AND tm.user_id = $1 "
        + "WHERE t.entity_type = 'individual' LIMIT 1",
      [args.userId],
    );
    if (existing.rowCount && existing.rowCount > 0) {
      await client.query("COMMIT");
      return;
    }

    const slug = `personal-${args.userId.replace(/-/g, "")}`;
    const created = await client.query<{ id: string }>(
      "INSERT INTO core.tenant(name, slug, entity_type) VALUES ($1, $2, 'individual') RETURNING id",
      ["Personal", slug],
    );
    const tenantId = created.rows[0]?.id;
    if (!tenantId) {
      throw new Error("Failed to create personal tenant.");
    }
    await client.query(
      "INSERT INTO core.tenant_member(tenant_id, user_id, role, status) VALUES ($1, $2, 'owner', 'active')",
      [tenantId, args.userId],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(256),
  displayName: z.string().min(1).max(200).optional(),
  phone: z.string().regex(PHONE_E164_REGEX, "Phone must use E.164 format, e.g. +34600111222.").optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(256),
});

export const verifyMfaTotpSchema = z.object({
  challengeToken: z.string().min(20).max(256),
  code: z.string().min(6).max(16),
});

export const verifyMfaPasskeySchema = z.object({
  challengeToken: z.string().min(20).max(256),
  authenticationResponse: z.unknown(),
});

export const verifyMfaTotpSetupSchema = z.object({
  setupToken: z.string().min(20).max(256),
  code: z.string().min(6).max(16),
});

export const startMfaPasskeySetupSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
});

export const verifyMfaPasskeySetupSchema = z.object({
  setupToken: z.string().min(20).max(256),
  registrationResponse: z.unknown(),
  label: z.string().trim().min(1).max(120).optional(),
});

export const removeMfaPasskeySchema = z.object({
  credentialId: z.string().min(10).max(4096),
});

export const verifyEmailSchema = z.object({
  email: z.string().email().optional(),
  token: z.string().min(10).optional(),
  code: z.string().min(4).max(32).optional(),
}).superRefine((input, ctx) => {
  if (!input.token && !input.code) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide either token or code.",
      path: ["code"],
    });
  }
  if (input.code && !input.email) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Email is required when verifying with code.",
      path: ["email"],
    });
  }
});

export const resendVerifyEmailSchema = z.object({
  email: z.string().email(),
});

export const emailChangeRequestSchema = z.object({
  newEmail: z.string().email(),
});

export const emailChangeVerifySchema = z.object({
  newEmail: z.string().email().optional(),
  token: z.string().min(10).optional(),
  code: z.string().min(4).max(32).optional(),
}).superRefine((input, ctx) => {
  if (!input.token && !input.code) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide either token or code.",
      path: ["code"],
    });
  }
  if (input.code && !input.newEmail) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "New email is required when verifying with code.",
      path: ["newEmail"],
    });
  }
});

export const passwordResetRequestSchema = z.object({
  email: z.string().email(),
});

export const passwordResetConfirmSchema = z.object({
  email: z.string().email().optional(),
  token: z.string().min(10).optional(),
  code: z.string().min(4).max(32).optional(),
  password: z.string().min(8).max(256),
}).superRefine((input, ctx) => {
  if (!input.token && !input.code) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide either token or code.",
      path: ["code"],
    });
  }
  if (input.code && !input.email) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Email is required when resetting password with code.",
      path: ["email"],
    });
  }
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(8).max(256),
}).refine(
  (input) => input.currentPassword !== input.newPassword,
  { message: "New password must be different from the current password.", path: ["newPassword"] },
);

export const updateMeSchema = z.object({
  displayName: z.string().trim().min(1).max(200).nullable().optional(),
  avatarUrl: z.string().trim().url().max(2048).nullable().optional(),
  phone: z.string().trim().regex(PHONE_E164_REGEX, "Phone must use E.164 format, e.g. +34600111222.").nullable().optional(),
}).refine(
  (input) => input.displayName !== undefined || input.avatarUrl !== undefined || input.phone !== undefined,
  { message: "No fields provided." },
);

export const avatarUploadUrlSchema = z.object({
  fileName: z.string().trim().min(1).max(255).optional(),
  contentType: z.string().trim().min(1).max(200),
  sizeBytes: z.number().int().positive(),
});

export const csrfHeaderName = "x-csrf-token";

export const getSingleQueryParam = (value: unknown): string | undefined => {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
};

export const requireAllowedReturnTo = (returnTo: string): string => {
  try {
    const url = new URL(returnTo);
    if (!isAllowedOrigin(url.origin)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "returnTo origin not allowed." });
    }
    return url.toString();
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid returnTo URL." });
  }
};

export const requireAllowedOrigin = (req: express.Request): string => {
  const origin = getRequestOrigin(req);
  if (!origin || !isAllowedOrigin(origin)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Origin not allowed." });
  }
  return origin;
};

export const assertAllowedOriginIfPresent = (req: express.Request): void => {
  const origin = getRequestOrigin(req);
  if (!origin) return;
  if (!isAllowedOrigin(origin)) throw new TRPCError({ code: "FORBIDDEN", message: "Origin not allowed." });
};

export const getCsrfHeader = (req: express.Request): string | undefined => {
  const value = req.headers[csrfHeaderName] as string | string[] | undefined;
  if (Array.isArray(value)) return value[0];
  return value;
};

export const setSessionCookies = (
  res: express.Response,
  args: { refreshToken: string; csrfToken: string; maxAgeSeconds: number },
): void => {
  const refreshCookie = serializeCookie(config.cookieNameRefresh, args.refreshToken, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: "/",
    maxAgeSeconds: args.maxAgeSeconds,
  });
  const csrfCookie = serializeCookie(config.cookieNameCsrf, args.csrfToken, {
    httpOnly: false,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: "/",
    maxAgeSeconds: args.maxAgeSeconds,
  });
  res.setHeader("Set-Cookie", [refreshCookie, csrfCookie]);
};

export const clearSessionCookies = (res: express.Response): void => {
  const refreshCookie = serializeCookie(config.cookieNameRefresh, "", {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: "/",
    maxAgeSeconds: 0,
  });
  const csrfCookie = serializeCookie(config.cookieNameCsrf, "", {
    httpOnly: false,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: "/",
    maxAgeSeconds: 0,
  });
  res.setHeader("Set-Cookie", [refreshCookie, csrfCookie]);
};

export const setCsrfCookie = (res: express.Response, args: { csrfToken: string; maxAgeSeconds: number }): void => {
  const csrfCookie = serializeCookie(config.cookieNameCsrf, args.csrfToken, {
    httpOnly: false,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: "/",
    maxAgeSeconds: args.maxAgeSeconds,
  });
  res.setHeader("Set-Cookie", csrfCookie);
};

export const assertCsrf = (req: express.Request): void => {
  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies[config.cookieNameCsrf];
  const headerToken = getCsrfHeader(req);
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "CSRF check failed." });
  }
};

export const requireAuthUserId = (req: express.Request): { userId: string } => {
  const token = getBearerToken(req.headers.authorization);
  if (!token) throw new TRPCError({ code: "UNAUTHORIZED", message: "Missing bearer token." });
  const claims = verifyAccessToken(token);
  return { userId: claims.sub };
};

export type RateLimiter = {
  consumeOrThrow: (key: string) => void;
};

export const makeInMemoryRateLimiter = (opts: {
  windowMs: number;
  max: number;
}): RateLimiter => {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return {
    consumeOrThrow(key: string) {
      const now = Date.now();
      const existing = buckets.get(key);
      if (!existing || existing.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
        return;
      }
      existing.count += 1;
      if (existing.count > opts.max) throw new TRPCError({ code: "TOO_MANY_REQUESTS" });
    },
  };
};

export const loginLimiter = makeInMemoryRateLimiter({ windowMs: 60_000, max: 30 });
export const registerLimiter = makeInMemoryRateLimiter({ windowMs: 60_000, max: 15 });
export const resendVerifyLimiter = makeInMemoryRateLimiter({ windowMs: 60_000, max: 20 });
export const EMAIL_TASK_CODE_PATTERN = /^\d{6}$/;

export const normalizeEmailTaskCode = (rawCode: string): string => rawCode.trim().replace(/\s+/g, "");

export const requireEmailTaskCode = (rawCode: string, contextLabel: string): string => {
  const normalized = normalizeEmailTaskCode(rawCode);
  if (!EMAIL_TASK_CODE_PATTERN.test(normalized)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${contextLabel} must be a 6-digit code.`,
    });
  }
  return normalized;
};

export const generateEmailTaskCode = (): string => String(randomInt(0, 1_000_000)).padStart(6, "0");

export const upsertPasswordCredential = async (
  client: { query: IdentityDb["query"] },
  args: { userId: string; passwordHash: string; algo: string },
): Promise<void> => {
  await client.query(
    "INSERT INTO iam.password_credential(user_id,password_hash,algo) VALUES ($1,$2,$3) "
      + "ON CONFLICT (user_id) DO UPDATE SET password_hash=EXCLUDED.password_hash, algo=EXCLUDED.algo, updated_at=now()",
    [args.userId, args.passwordHash, args.algo],
  );
};

export const issueEmailVerificationForUser = async (
  client: { query: IdentityDb["query"] },
  args: { userId: string; email: string; origin: string; requeueExisting?: boolean },
): Promise<{ verifyToken: string; verifyCode: string; reused: boolean }> => {
  if (args.requeueExisting || AUTH_EMAIL_VERIFICATION_REUSE_WINDOW_SECONDS > 0) {
    const reusableTokenResult = await client.query<{
      created_at: string | Date;
    }>(
      "SELECT created_at FROM iam.email_verification_token "
        + "WHERE user_id=$1 AND used_at IS NULL AND expires_at > now() "
        + "ORDER BY created_at DESC LIMIT 1",
      [args.userId],
    );
    const reusableToken = reusableTokenResult.rows[0];
    const createdAt = reusableToken?.created_at instanceof Date
      ? reusableToken.created_at.getTime()
      : (typeof reusableToken?.created_at === "string" ? Date.parse(reusableToken.created_at) : Number.NaN);

    const canReuseExisting =
      args.requeueExisting
      || (Number.isFinite(createdAt) && (Date.now() - createdAt) <= AUTH_EMAIL_VERIFICATION_REUSE_WINDOW_SECONDS * 1000);

    if (canReuseExisting) {
      const reusableOutboxResult = await client.query<{ payload: unknown }>(
        "SELECT payload FROM ops.outbox_event WHERE topic=$1 AND key=$2 LIMIT 1",
        ["identity.email_verification", `email_verify:${args.userId}`],
      );
      const reusablePayload = reusableOutboxResult.rows[0]?.payload as Record<string, unknown> | undefined;
      const reusableEmail = typeof reusablePayload?.["to_email"] === "string" ? reusablePayload["to_email"].trim().toLowerCase() : null;
      const reusableTokenValue = typeof reusablePayload?.["verify_token"] === "string" ? reusablePayload["verify_token"].trim() : null;
      const reusableCodeValue = typeof reusablePayload?.["verify_code"] === "string" ? reusablePayload["verify_code"].trim() : null;

      if (reusableEmail === args.email.trim().toLowerCase() && reusableTokenValue && reusableCodeValue) {
        if (args.requeueExisting) {
          await requeueOutboxEvent(
            (s, p) => client.query(s, p),
            "identity.email_verification",
            `email_verify:${args.userId}`,
            {
              user_id: args.userId,
              to_email: args.email,
              verify_token: reusableTokenValue,
              verify_code: reusableCodeValue,
              origin: args.origin,
            },
          );
        }

        return { verifyToken: reusableTokenValue, verifyCode: reusableCodeValue, reused: true };
      }
    }
  }

  await client.query(
    "UPDATE iam.email_verification_token SET used_at=now() WHERE user_id=$1 AND used_at IS NULL",
    [args.userId],
  );
  const verifyToken = randomToken(32);
  const verifyCode = generateEmailTaskCode();
  const verifyTokenHash = sha256Base64Url(verifyToken);
  const verifyCodeHash = sha256Base64Url(verifyCode);
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  await client.query(
    "INSERT INTO iam.email_verification_token(user_id,token_hash,code_hash,expires_at) VALUES ($1,$2,$3,$4)",
    [args.userId, verifyTokenHash, verifyCodeHash, expiresAt],
  );
  await requeueOutboxEvent(
    (s, p) => client.query(s, p),
    "identity.email_verification",
    `email_verify:${args.userId}`,
    {
      user_id: args.userId,
      to_email: args.email,
      verify_token: verifyToken,
      verify_code: verifyCode,
      origin: args.origin,
    },
  );
  return { verifyToken, verifyCode, reused: false };
};

export type OAuthProvider = "google" | "twitter";

export const oauthStateModel = "Interaction";

export const oauthStatePayloadSchema = z.object({
  v: z.literal(1),
  kind: z.literal("oauth_login"),
  provider: z.union([z.literal("google"), z.literal("twitter")]),
  code_verifier: z.string().min(10),
  return_to: z.string().min(1),
});
export type OAuthStatePayload = z.infer<typeof oauthStatePayloadSchema>;

export const createOauthState = async (
  identityDb: IdentityDb,
  payload: OAuthStatePayload,
): Promise<{ state: string; codeChallenge: string }> => {
  const state = randomToken(18);
  const codeVerifier = payload.code_verifier;
  const codeChallenge = sha256Base64Url(codeVerifier);
  const expiresAtIso = new Date(Date.now() + config.oauthStateTtlSeconds * 1000).toISOString();

  await identityDb.query(
    "INSERT INTO oidc.store(model,id,payload,expires_at) VALUES ($1,$2,$3,$4)",
    [oauthStateModel, state, payload, expiresAtIso],
  );

  return { state, codeChallenge };
};

export const consumeOauthState = async (
  identityDb: { withTx: <T>(fn: (client: { query: IdentityDb["query"] }) => Promise<T>) => Promise<T> },
  args: { state: string; provider: OAuthProvider },
): Promise<OAuthStatePayload> =>
  identityDb.withTx(async (client) => {
    const existing = await client.query<{
      payload: unknown;
      expires_at: string;
      consumed_at: string | null;
    }>(
      "SELECT payload,expires_at,consumed_at FROM oidc.store WHERE model=$1 AND id=$2 FOR UPDATE",
      [oauthStateModel, args.state],
    );
    const row = existing.rows[0];
    if (!row) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid OAuth state." });
    if (new Date(row.expires_at).getTime() <= Date.now()) throw new TRPCError({ code: "BAD_REQUEST", message: "OAuth state expired." });
    if (row.consumed_at) throw new TRPCError({ code: "BAD_REQUEST", message: "OAuth state already used." });

    const parsed = oauthStatePayloadSchema.safeParse(row.payload);
    if (!parsed.success) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid OAuth state payload." });
    const payload = parsed.data;
    if (payload.provider !== args.provider) throw new TRPCError({ code: "BAD_REQUEST", message: "OAuth provider mismatch." });

    await client.query(
      "UPDATE oidc.store SET consumed_at=now() WHERE model=$1 AND id=$2 AND consumed_at IS NULL",
      [oauthStateModel, args.state],
    );

    return payload;
  });

export const toFormBody = (params: Record<string, string>): string =>
  new URLSearchParams(params).toString();

export const requireConfigured = (value: string | undefined, name: string): string => {
  const v = value?.trim();
  if (!v) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `${name} not configured.` });
  return v;
};

export const googleTokenSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().min(1),
  expires_in: z.number().int().optional(),
  scope: z.string().optional(),
  id_token: z.string().optional(),
  refresh_token: z.string().optional(),
});

export const googleUserInfoSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email().optional(),
  email_verified: z.boolean().optional(),
  name: z.string().optional(),
  picture: z.string().url().optional(),
});

export const exchangeGoogleCode = async (args: {
  code: string;
  codeVerifier: string;
}): Promise<z.infer<typeof googleUserInfoSchema>> => {
  const clientId = requireConfigured(config.oauthGoogleClientId, "OAUTH_GOOGLE_CLIENT_ID");
  const clientSecret = requireConfigured(config.oauthGoogleClientSecret, "OAUTH_GOOGLE_CLIENT_SECRET");
  const redirectUri = config.oauthGoogleRedirectUri;

  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: toFormBody({
      code: args.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: args.codeVerifier,
    }),
  });
  const tokenJson = await tokenResp.json().catch(() => null);
  const tokenParsed = googleTokenSchema.safeParse(tokenJson);
  if (!tokenResp.ok || !tokenParsed.success) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Google token exchange failed." });
  }

  const userInfoResp = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    method: "GET",
    headers: { Authorization: `Bearer ${tokenParsed.data.access_token}` },
  });
  const userInfoJson = await userInfoResp.json().catch(() => null);
  const userInfoParsed = googleUserInfoSchema.safeParse(userInfoJson);
  if (!userInfoResp.ok || !userInfoParsed.success) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Google userinfo fetch failed." });
  }
  return userInfoParsed.data;
};

export const twitterTokenSchema = z.object({
  token_type: z.string().min(1),
  access_token: z.string().min(1),
  scope: z.string().optional(),
  expires_in: z.number().int().optional(),
  refresh_token: z.string().optional(),
});

export const twitterUserSchema = z.object({
  data: z.object({
    id: z.string().min(1),
    name: z.string().optional(),
    username: z.string().optional(),
    profile_image_url: z.string().url().optional(),
    verified: z.boolean().optional(),
  }),
});

export const exchangeTwitterCode = async (args: {
  code: string;
  codeVerifier: string;
}): Promise<z.infer<typeof twitterUserSchema>["data"]> => {
  const clientId = requireConfigured(config.oauthTwitterClientId, "OAUTH_TWITTER_CLIENT_ID");
  const clientSecret = requireConfigured(config.oauthTwitterClientSecret, "OAUTH_TWITTER_CLIENT_SECRET");
  const redirectUri = config.oauthTwitterRedirectUri;

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const tokenResp = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: toFormBody({
      grant_type: "authorization_code",
      code: args.code,
      redirect_uri: redirectUri,
      code_verifier: args.codeVerifier,
      client_id: clientId,
    }),
  });
  const tokenJson = await tokenResp.json().catch(() => null);
  const tokenParsed = twitterTokenSchema.safeParse(tokenJson);
  if (!tokenResp.ok || !tokenParsed.success) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Twitter token exchange failed." });
  }

  const userResp = await fetch("https://api.twitter.com/2/users/me?user.fields=profile_image_url,name,username,verified", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${tokenParsed.data.access_token}`,
    },
  });
  const userJson = await userResp.json().catch(() => null);
  const userParsed = twitterUserSchema.safeParse(userJson);
  if (!userResp.ok || !userParsed.success) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Twitter user fetch failed." });
  }
  return userParsed.data.data;
};
