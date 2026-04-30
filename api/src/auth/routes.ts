import type express from "express";
import { TRPCError } from "@trpc/server";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { authenticator } from "otplib";
import { z } from "zod";
import { config } from "../config.js";
import { signAccessToken } from "./jwt.js";
import { getRequestIp, getUserAgent, parseCookies, randomToken, sha256Base64Url } from "./http.js";
import { hashPassword, verifyPassword } from "./password.js";
import { issueRefreshToken, revokeRefreshToken, rotateRefreshToken } from "./refreshTokens.js";
import { insertOutboxEvent } from "../utils/outbox.js";

import {
  IdentityDb,
  json,
  shouldExposeDevCodes,
  MfaMethod,
  LoginChallengePayload,
  TotpSetupChallengePayload,
  PasskeySetupChallengePayload,
  MFA_METHODS,
  isRecord,
  isAuthenticationResponseJson,
  isRegistrationResponseJson,
  serializePasskeyAuthenticationOptions,
  resolveMfaPolicyForUser,
  requireTotpCode,
  upsertChallenge,
  loadChallengeForUpdate,
  incrementChallengeAttempt,
  markChallengeUsed,
  issueSessionForUser,
  upsertPasswordCredential,
  toBase64Url,
  fromBase64Url,
  normalizeTransportList,
  mapPasskeyVerificationErrorMessage,
  parseLoginChallengePayload,
  applyPendingTenantInvitesForVerifiedEmail,
  ensurePersonalTenantForUser,
  registerSchema,
  loginSchema,
  verifyMfaTotpSchema,
  verifyMfaPasskeySchema,
  verifyMfaTotpSetupSchema,
  startMfaPasskeySetupSchema,
  verifyMfaPasskeySetupSchema,
  removeMfaPasskeySchema,
  verifyEmailSchema,
  resendVerifyEmailSchema,
  emailChangeRequestSchema,
  emailChangeVerifySchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
  passwordChangeSchema,
  updateMeSchema,
  getSingleQueryParam,
  requireAllowedReturnTo,
  requireAllowedOrigin,
  assertAllowedOriginIfPresent,
  setSessionCookies,
  clearSessionCookies,
  setCsrfCookie,
  assertCsrf,
  requireAuthUserId,
  loginLimiter,
  registerLimiter,
  resendVerifyLimiter,
  requireEmailTaskCode,
  generateEmailTaskCode,
  issueEmailVerificationForUser,
  createOauthState,
  consumeOauthState,
  requireConfigured,
  exchangeGoogleCode,
  exchangeTwitterCode,
} from "./shared.js";

export { upsertPasswordCredential } from "./shared.js";

export const mountAuthRoutes = (app: express.Express, deps: { identityDb: IdentityDb }): void => {
  app.post("/auth/register", async (req, res) => {
    try {
      const origin = requireAllowedOrigin(req);
      registerLimiter.consumeOrThrow(getRequestIp(req) ?? "unknown");
      const input = registerSchema.parse(req.body);

      const { hash, algo } = await hashPassword(input.password);

      const result = await deps.identityDb.withTx(async (client) => {
        const existing = await client.query<{ id: string; email_verified: boolean; is_active: boolean }>(
          "SELECT id,email_verified,is_active FROM iam.user_account WHERE lower(email)=lower($1) LIMIT 1 FOR UPDATE",
          [input.email],
        );
        const existingUser = existing.rows[0];
        if (existingUser) {
          if (!existingUser.is_active) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Account is disabled. Contact support." });
          }
          if (existingUser.email_verified) {
            if (shouldExposeDevCodes) {
              throw new TRPCError({ code: "CONFLICT", message: "Email already registered. Please sign in." });
            }
            return {
              userId: null as string | null,
              emailVerified: false,
              alreadyRegistered: true,
              verifyToken: null as string | null,
              verifyCode: null as string | null,
              verificationReused: false,
            };
          }
          await upsertPasswordCredential(client, {
            userId: existingUser.id,
            passwordHash: hash,
            algo,
          });
          const verification = await issueEmailVerificationForUser(client, {
            userId: existingUser.id,
            email: input.email,
            origin,
            requeueExisting: true,
          });
          return {
            userId: existingUser.id,
            emailVerified: false,
            alreadyRegistered: true,
            verifyToken: verification.verifyToken,
            verifyCode: verification.verifyCode,
            verificationReused: verification.reused,
          };
        }

        const user = await client.query<{ id: string; email_verified: boolean }>(
          "INSERT INTO iam.user_account(email,email_verified,display_name,phone,is_active) VALUES ($1,false,$2,$3,true) RETURNING id,email_verified",
          [input.email, input.displayName ?? null, input.phone ?? null],
        );
        const userId = user.rows[0]?.id;
        if (!userId) throw new Error("Failed to create user.");

        await upsertPasswordCredential(client, {
          userId,
          passwordHash: hash,
          algo,
        });

        const verification = await issueEmailVerificationForUser(client, {
          userId,
          email: input.email,
          origin,
          requeueExisting: true,
        });

        return {
          userId,
          emailVerified: false,
          alreadyRegistered: false,
          verifyToken: verification.verifyToken,
          verifyCode: verification.verifyCode,
          verificationReused: verification.reused,
        };
      });

      if (!result.alreadyRegistered && result.userId) {
        try {
          await ensurePersonalTenantForUser({ userId: result.userId });
        } catch (error) {
          console.error("[auth.register][default-customer-access]", error);
        }
      }

      return json(res, shouldExposeDevCodes ? (result.alreadyRegistered ? 200 : 201) : 200, {
        ok: true,
        userId: result.userId,
        emailVerified: result.emailVerified,
        ...(shouldExposeDevCodes
          ? {
            alreadyRegistered: result.alreadyRegistered,
            verification_reused: result.verificationReused,
          }
          : {}),
        ...(shouldExposeDevCodes ? { dev_verify_token: result.verifyToken, dev_verify_code: result.verifyCode } : {}),
      });
    } catch (err) {
      if (err instanceof TRPCError) return json(res, mapTrpcErrorToStatus(err), { ok: false, error: err.message });
      if (err instanceof z.ZodError) return json(res, 400, { ok: false, error: "Invalid request." });
      console.error("[auth.register]", err);
      return json(res, 500, { ok: false, error: "Internal error." });
    }
  });

  app.post("/auth/email/verify/resend", async (req, res) => {
    try {
      const origin = requireAllowedOrigin(req);
      resendVerifyLimiter.consumeOrThrow(getRequestIp(req) ?? "unknown");
      const input = resendVerifyEmailSchema.parse(req.body);

      const out = await deps.identityDb.withTx(async (client) => {
        const existing = await client.query<{ id: string; email_verified: boolean; is_active: boolean }>(
          "SELECT id,email_verified,is_active FROM iam.user_account WHERE lower(email)=lower($1) LIMIT 1 FOR UPDATE",
          [input.email],
        );
        const user = existing.rows[0];
        if (!user || user.email_verified || !user.is_active) {
          return {
            verifyToken: null as string | null,
            verifyCode: null as string | null,
            verificationReused: false,
          };
        }
        const verification = await issueEmailVerificationForUser(client, {
          userId: user.id,
          email: input.email,
          origin,
          requeueExisting: true,
        });
        return {
          verifyToken: verification.verifyToken,
          verifyCode: verification.verifyCode,
          verificationReused: verification.reused,
        };
      });

      return json(res, 200, {
        ok: true,
        verification_reused: out.verificationReused,
        ...(shouldExposeDevCodes && out.verifyToken && out.verifyCode
          ? { dev_verify_token: out.verifyToken, dev_verify_code: out.verifyCode }
          : {}),
      });
    } catch (err) {
      if (err instanceof TRPCError) return json(res, mapTrpcErrorToStatus(err), { ok: false, error: err.message });
      if (err instanceof z.ZodError) return json(res, 400, { ok: false, error: "Invalid request." });
      console.error("[auth.email.verify.resend]", err);
      return json(res, 500, { ok: false, error: "Internal error." });
    }
  });

  app.post("/auth/email/verify", async (req, res) => {
    try {
      assertAllowedOriginIfPresent(req);
      const input = verifyEmailSchema.parse(req.body);
      const ip = getRequestIp(req);
      const userAgent = getUserAgent(req);
      const emailForCode = input.email?.trim().toLowerCase() ?? null;
      const tokenHash = input.token ? sha256Base64Url(input.token) : null;
      const verificationCode = input.code
        ? requireEmailTaskCode(input.code, "Email verification code")
        : null;
      const verificationCodeHash = verificationCode ? sha256Base64Url(verificationCode) : null;

      const out = await deps.identityDb.withTx(async (client) => {
        type VerificationTokenRow = { id: string; user_id: string };
        let tokenRow: VerificationTokenRow | undefined;
        if (tokenHash) {
          const tokenResult = await client.query<VerificationTokenRow>(
            "SELECT id,user_id FROM iam.email_verification_token "
              + "WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now() "
              + "ORDER BY created_at DESC LIMIT 1",
            [tokenHash],
          );
          tokenRow = tokenResult.rows[0];
        } else {
          if (!emailForCode || !verificationCodeHash) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Email verification code is required." });
          }
          const codeResult = await client.query<VerificationTokenRow>(
            "SELECT evt.id,evt.user_id "
              + "FROM iam.email_verification_token evt "
              + "JOIN iam.user_account ua ON ua.id=evt.user_id "
              + "WHERE lower(ua.email)=lower($1) "
              + "  AND evt.code_hash=$2 "
              + "  AND evt.used_at IS NULL "
              + "  AND evt.expires_at > now() "
              + "ORDER BY evt.created_at DESC LIMIT 1",
            [emailForCode, verificationCodeHash],
          );
          tokenRow = codeResult.rows[0];
        }
        if (!tokenRow) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired verification credential." });

        await client.query("UPDATE iam.email_verification_token SET used_at=now() WHERE id=$1", [tokenRow.id]);
        const updated = await client.query<{ id: string; email: string | null }>(
          "UPDATE iam.user_account SET email_verified=true WHERE id=$1 RETURNING id,email",
          [tokenRow.user_id],
        );
        const user = updated.rows[0];
        if (!user) throw new Error("User not found.");

        await client.query(
          "INSERT INTO iam.security_event(event_type,user_id,ip,user_agent,meta) VALUES ('EMAIL_VERIFIED',$1,$2,$3,$4)",
          [user.id, ip ?? null, userAgent ?? null, {}],
        );
        return { userId: user.id, email: user.email };
      });

      try {
        await applyPendingTenantInvitesForVerifiedEmail({ userId: out.userId, email: out.email });
      } catch (error) {
        console.error("[auth.email.verify][auto-accept-invites]", error);
      }
      try {
        await ensurePersonalTenantForUser({ userId: out.userId });
      } catch (error) {
        console.error("[auth.email.verify][default-customer-access]", error);
      }

      return json(res, 200, { ok: true, ...out });
    } catch (err) {
      if (err instanceof TRPCError) return json(res, mapTrpcErrorToStatus(err), { ok: false, error: err.message });
      if (err instanceof z.ZodError) return json(res, 400, { ok: false, error: "Invalid request." });
      console.error("[auth.email.verify]", err);
      return json(res, 500, { ok: false, error: "Internal error." });
    }
  });

  app.post("/auth/email/change/request", async (req, res) => {
    try {
      const origin = requireAllowedOrigin(req);
      assertCsrf(req);
      const { userId } = requireAuthUserId(req);
      const input = emailChangeRequestSchema.parse(req.body);

      const out = await deps.identityDb.withTx(async (client) => {
        const userResult = await client.query<{ id: string; email: string | null; is_active: boolean }>(
          "SELECT id,email,is_active FROM iam.user_account WHERE id=$1",
          [userId],
        );
        const user = userResult.rows[0];
        if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
        if (!user.is_active) throw new TRPCError({ code: "FORBIDDEN", message: "Account disabled." });

        if ((user.email ?? "").toLowerCase() === input.newEmail.toLowerCase()) {
          return { alreadyCurrent: true as const, verifyToken: null as string | null, verifyCode: null as string | null };
        }

        const existing = await client.query<{ id: string }>(
          "SELECT id FROM iam.user_account WHERE email=$1 AND id<>$2",
          [input.newEmail, userId],
        );
        if (existing.rows[0]) {
          throw new TRPCError({ code: "CONFLICT", message: "Email already registered." });
        }

        await client.query(
          "UPDATE iam.email_change_token SET used_at=now() WHERE user_id=$1 AND used_at IS NULL",
          [userId],
        );

        const verifyToken = randomToken(32);
        const verifyCode = generateEmailTaskCode();
        const verifyTokenHash = sha256Base64Url(verifyToken);
        const verifyCodeHash = sha256Base64Url(verifyCode);
        const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
        const inserted = await client.query<{ id: string }>(
          "INSERT INTO iam.email_change_token(user_id,new_email,token_hash,code_hash,expires_at) "
            + "VALUES ($1,$2,$3,$4,$5) RETURNING id",
          [userId, input.newEmail, verifyTokenHash, verifyCodeHash, expiresAt],
        );
        const tokenId = inserted.rows[0]?.id;
        if (!tokenId) throw new Error("Failed to create email change token.");

        await insertOutboxEvent(
          (s, p) => client.query(s, p),
          "identity.email_change_verification",
          `email_change_verify:${tokenId}`,
          {
            user_id: userId,
            to_email: input.newEmail,
            verify_token: verifyToken,
            verify_code: verifyCode,
            ...(origin ? { origin } : {}),
          },
        );

        return { alreadyCurrent: false as const, verifyToken, verifyCode };
      });

      return json(res, 200, {
        ok: true,
        already_current: out.alreadyCurrent,
        ...(shouldExposeDevCodes && out.verifyToken && out.verifyCode
          ? { dev_verify_token: out.verifyToken, dev_verify_code: out.verifyCode }
          : {}),
      });
    } catch (err) {
      if (err instanceof TRPCError) return json(res, mapTrpcErrorToStatus(err), { ok: false, error: err.message });
      if (err instanceof z.ZodError) return json(res, 400, { ok: false, error: "Invalid request." });
      console.error("[auth.email.change.request]", err);
      return json(res, 500, { ok: false, error: "Internal error." });
    }
  });

  app.post("/auth/email/change/verify", async (req, res) => {
    try {
      assertAllowedOriginIfPresent(req);
      const input = emailChangeVerifySchema.parse(req.body);
      const ip = getRequestIp(req);
      const userAgent = getUserAgent(req);
      const tokenHash = input.token ? sha256Base64Url(input.token) : null;
      const verificationCode = input.code
        ? requireEmailTaskCode(input.code, "Email change verification code")
        : null;
      const verificationCodeHash = verificationCode ? sha256Base64Url(verificationCode) : null;
      const newEmail = input.newEmail?.trim().toLowerCase() ?? null;

      const out = await deps.identityDb.withTx(async (client) => {
        type EmailChangeTokenRow = { id: string; user_id: string; new_email: string };
        let tokenRow: EmailChangeTokenRow | undefined;
        if (tokenHash) {
          const tokenResult = await client.query<EmailChangeTokenRow>(
            "SELECT id,user_id,new_email FROM iam.email_change_token "
              + "WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now() "
              + "ORDER BY created_at DESC LIMIT 1",
            [tokenHash],
          );
          tokenRow = tokenResult.rows[0];
        } else {
          if (!verificationCodeHash || !newEmail) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Email change verification code is required." });
          }
          const codeResult = await client.query<EmailChangeTokenRow>(
            "SELECT id,user_id,new_email FROM iam.email_change_token "
              + "WHERE lower(new_email)=lower($1) "
              + "  AND code_hash=$2 "
              + "  AND used_at IS NULL "
              + "  AND expires_at > now() "
              + "ORDER BY created_at DESC LIMIT 1",
            [newEmail, verificationCodeHash],
          );
          tokenRow = codeResult.rows[0];
        }
        if (!tokenRow) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired verification credential." });

        await client.query("UPDATE iam.email_change_token SET used_at=now() WHERE id=$1", [tokenRow.id]);

        const currentResult = await client.query<{ email: string | null }>(
          "SELECT email FROM iam.user_account WHERE id=$1",
          [tokenRow.user_id],
        );
        const current = currentResult.rows[0];
        if (!current) throw new TRPCError({ code: "UNAUTHORIZED" });

        type AuthUserRow = {
          id: string;
          email: string | null;
          email_verified: boolean;
          display_name: string | null;
          avatar_url: string | null;
          is_active: boolean;
        };
        let userResult: { rows: AuthUserRow[] };
        try {
          userResult = await client.query<AuthUserRow>(
            "UPDATE iam.user_account SET email=$2, email_verified=true, updated_at=now() WHERE id=$1 "
              + "RETURNING id,email,email_verified,display_name,avatar_url,is_active",
            [tokenRow.user_id, tokenRow.new_email],
          );
        } catch (updateErr) {
          const errWithCode = updateErr as { code?: string };
          if (errWithCode.code === "23505") {
            throw new TRPCError({ code: "CONFLICT", message: "Email already registered." });
          }
          throw updateErr;
        }
        const user = userResult.rows[0];
        if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });

        await client.query(
          "UPDATE iam.email_change_token SET used_at=now() WHERE user_id=$1 AND used_at IS NULL",
          [tokenRow.user_id],
        );

        await client.query(
          "INSERT INTO iam.security_event(event_type,user_id,ip,user_agent,meta) VALUES ('EMAIL_CHANGED',$1,$2,$3,$4)",
          [tokenRow.user_id, ip ?? null, userAgent ?? null, { from_email: current.email, to_email: tokenRow.new_email }],
        );

        return user;
      });

      return json(res, 200, { ok: true, user: out });
    } catch (err) {
      if (err instanceof TRPCError) return json(res, mapTrpcErrorToStatus(err), { ok: false, error: err.message });
      if (err instanceof z.ZodError) return json(res, 400, { ok: false, error: "Invalid request." });
      console.error("[auth.email.change.verify]", err);
      return json(res, 500, { ok: false, error: "Internal error." });
    }
  });

  app.post("/auth/login", async (req, res) => {
    try {
      assertAllowedOriginIfPresent(req);
      loginLimiter.consumeOrThrow(getRequestIp(req) ?? "unknown");
      const input = loginSchema.parse(req.body);

      const ip = getRequestIp(req);
      const userAgent = getUserAgent(req);

      const result = await deps.identityDb.withTx(async (client) => {
        const userResult = await client.query<{
          id: string;
          email: string | null;
          email_verified: boolean;
          is_active: boolean;
          disabled_reason: string | null;
        }>(
          "SELECT id,email,email_verified,is_active,disabled_reason FROM iam.user_account WHERE lower(email)=lower($1)",
          [input.email],
        );
        const user = userResult.rows[0];
        if (!user) {
          await client.query(
            "INSERT INTO iam.auth_attempt(email,ip,user_agent,outcome,reason) VALUES ($1,$2,$3,'failure','USER_NOT_FOUND')",
            [input.email, ip ?? null, userAgent ?? null],
          );
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials." });
        }
        if (!user.is_active) {
          await client.query(
            "INSERT INTO iam.auth_attempt(email,user_id,ip,user_agent,outcome,reason) VALUES ($1,$2,$3,$4,'failure','USER_DISABLED')",
            [input.email, user.id, ip ?? null, userAgent ?? null],
          );
          throw new TRPCError({ code: "FORBIDDEN", message: "Account disabled." });
        }
        if (!user.email_verified) {
          await client.query(
            "INSERT INTO iam.auth_attempt(email,user_id,ip,user_agent,outcome,reason) VALUES ($1,$2,$3,$4,'failure','EMAIL_NOT_VERIFIED')",
            [input.email, user.id, ip ?? null, userAgent ?? null],
          );
          throw new TRPCError({ code: "FORBIDDEN", message: "Email not verified." });
        }

        const cred = await client.query<{ password_hash: string }>(
          "SELECT password_hash FROM iam.password_credential WHERE user_id=$1",
          [user.id],
        );
        const row = cred.rows[0];
        if (!row) {
          await client.query(
            "INSERT INTO iam.auth_attempt(email,user_id,ip,user_agent,outcome,reason) VALUES ($1,$2,$3,$4,'failure','UNKNOWN')",
            [input.email, user.id, ip ?? null, userAgent ?? null],
          );
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials." });
        }

        const ok = await verifyPassword(row.password_hash, input.password);
        if (!ok) {
          await client.query(
            "INSERT INTO iam.auth_attempt(email,user_id,ip,user_agent,outcome,reason) VALUES ($1,$2,$3,$4,'failure','PASSWORD_INVALID')",
            [input.email, user.id, ip ?? null, userAgent ?? null],
          );
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials." });
        }

        const mfaPolicy = await resolveMfaPolicyForUser(user.id);
        const totpResult = await client.query<{ enabled: boolean }>(
          "SELECT EXISTS ("
            + "  SELECT 1 FROM iam.mfa_totp_factor "
            + "  WHERE user_id=$1 AND is_active=true AND disabled_at IS NULL"
            + ") AS enabled",
          [user.id],
        );
        const passkeyResult = await client.query<{ count: string | number }>(
          "SELECT COUNT(*)::int AS count "
            + "FROM iam.webauthn_credential "
            + "WHERE user_id=$1 AND revoked_at IS NULL",
          [user.id],
        );
        const passkeyCountRaw = passkeyResult.rows[0]?.count;
        const passkeyCount = typeof passkeyCountRaw === "string"
          ? Number.parseInt(passkeyCountRaw, 10)
          : Number(passkeyCountRaw ?? 0);
        const factorEnabledByMethod: Record<MfaMethod, boolean> = {
          authenticator_app: Boolean(totpResult.rows[0]?.enabled),
          passkey: passkeyCount > 0,
        };
        const hasAnyEnabledFactor = factorEnabledByMethod.authenticator_app || factorEnabledByMethod.passkey;
        const shouldRequireMfa = mfaPolicy.required || hasAnyEnabledFactor;

        if (shouldRequireMfa) {
          const allowedMethodsByPolicy = mfaPolicy.required
            ? mfaPolicy.allowedMethods
            : [...MFA_METHODS];
          const availableMethods = allowedMethodsByPolicy.filter((method) => factorEnabledByMethod[method]);

          if (!availableMethods.length) {
            await client.query(
              "INSERT INTO iam.auth_attempt(email,user_id,ip,user_agent,outcome,reason,meta) "
                + "VALUES ($1,$2,$3,$4,'failure','MFA_REQUIRED',$5)",
              [
                input.email,
                user.id,
                ip ?? null,
                userAgent ?? null,
                {
                  setup_required: true,
                  policy_required: mfaPolicy.required,
                  allowed_methods: allowedMethodsByPolicy,
                  matched_tenants: mfaPolicy.matchedTenants,
                },
              ],
            );
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Second-stage auth is required. Configure authenticator app or passkey in your profile security settings.",
            });
          }

          let passkeyAuthenticationOptions: Record<string, unknown> | null = null;
          let passkeyChallenge: string | undefined;
          if (availableMethods.includes("passkey")) {
            const credentialRows = await client.query<{
              credential_id: string;
              transports: unknown;
            }>(
              "SELECT credential_id,transports "
                + "FROM iam.webauthn_credential "
                + "WHERE user_id=$1 AND revoked_at IS NULL "
                + "ORDER BY created_at DESC",
              [user.id],
            );

            const authenticationOptions = await generateAuthenticationOptions({
              rpID: config.passkeyRpId,
              userVerification: "required",
              timeout: 60_000,
              allowCredentials: credentialRows.rows.map((row) => ({
                id: row.credential_id,
                transports: normalizeTransportList(row.transports) as (
                  "ble"
                  | "hybrid"
                  | "internal"
                  | "nfc"
                  | "usb"
                )[],
              })),
            });
            passkeyAuthenticationOptions = serializePasskeyAuthenticationOptions(authenticationOptions);
            passkeyChallenge = authenticationOptions.challenge;
          }

          const challengePayload: LoginChallengePayload = {
            user_id: user.id,
            email: user.email,
            email_verified: user.email_verified,
            allowed_methods: availableMethods,
            ...(passkeyChallenge ? { passkey_challenge: passkeyChallenge } : {}),
          };
          const challenge = await upsertChallenge(client, {
            userId: user.id,
            challengeType: "login",
            payload: challengePayload,
            ttlSeconds: 5 * 60,
            maxAttempts: 8,
          });

          await client.query(
            "INSERT INTO iam.auth_attempt(email,user_id,ip,user_agent,outcome,reason,meta) "
              + "VALUES ($1,$2,$3,$4,'failure','MFA_REQUIRED',$5)",
            [
              input.email,
              user.id,
              ip ?? null,
              userAgent ?? null,
              {
                allowed_methods: availableMethods,
                matched_tenants: mfaPolicy.matchedTenants,
                policy_required: mfaPolicy.required,
                fallback_factor_enforcement: !mfaPolicy.required && hasAnyEnabledFactor,
              },
            ],
          );

          return {
            mfaRequired: true as const,
            challengeToken: challenge.token,
            availableMethods,
            passkeyAuthenticationOptions,
          };
        }

        await client.query(
          "INSERT INTO iam.auth_attempt(email,user_id,ip,user_agent,outcome,reason) VALUES ($1,$2,$3,$4,'success',NULL)",
          [input.email, user.id, ip ?? null, userAgent ?? null],
        );
        await client.query("UPDATE iam.user_account SET last_login_at=now() WHERE id=$1", [user.id]);

        const issuedSession = await issueSessionForUser(client, user);
        return {
          mfaRequired: false as const,
          ...issuedSession,
        };
      });

      if (result.mfaRequired) {
        return json(res, 200, {
          ok: true,
          mfaRequired: true,
          challengeToken: result.challengeToken,
          availableMethods: result.availableMethods,
          ...(result.passkeyAuthenticationOptions
            ? { passkeyAuthenticationOptions: result.passkeyAuthenticationOptions }
            : {}),
        });
      }

      setSessionCookies(res, {
        refreshToken: result.refreshToken,
        csrfToken: result.csrfToken,
        maxAgeSeconds: config.refreshTokenTtlSeconds,
      });

      return json(res, 200, {
        ok: true,
        userId: result.userId,
        accessToken: result.accessToken,
        csrfToken: result.csrfToken,
      });
    } catch (err) {
      if (err instanceof TRPCError) return json(res, mapTrpcErrorToStatus(err), { ok: false, error: err.message });
      if (err instanceof z.ZodError) return json(res, 400, { ok: false, error: "Invalid request." });
      console.error("[auth.login]", err);
      return json(res, 500, { ok: false, error: "Internal error." });
    }
  });

  app.post("/auth/mfa/verify/totp", async (req, res) => {
    try {
      assertAllowedOriginIfPresent(req);
      const input = verifyMfaTotpSchema.parse(req.body);
      const code = requireTotpCode(input.code);
      const ip = getRequestIp(req);
      const userAgent = getUserAgent(req);

      const session = await deps.identityDb.withTx(async (client) => {
        const challenge = await loadChallengeForUpdate(client, {
          token: input.challengeToken,
          expectedTypes: ["login"],
        });
        const payload = parseLoginChallengePayload(challenge.payload);
        if (!payload.allowed_methods.includes("authenticator_app")) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Authenticator app is not enabled for this challenge." });
        }

        const factorResult = await client.query<{ secret_base32: string }>(
          "SELECT secret_base32 "
            + "FROM iam.mfa_totp_factor "
            + "WHERE user_id=$1 AND is_active=true AND disabled_at IS NULL "
            + "ORDER BY created_at DESC LIMIT 1",
          [challenge.user_id],
        );
        const factor = factorResult.rows[0];
        if (!factor) {
          await incrementChallengeAttempt(client, challenge.id);
          throw new TRPCError({ code: "BAD_REQUEST", message: "No active authenticator app setup found." });
        }

        const verified = authenticator.check(code, factor.secret_base32);
        if (!verified) {
          await incrementChallengeAttempt(client, challenge.id);
          await client.query(
            "INSERT INTO iam.auth_attempt(email,user_id,ip,user_agent,outcome,reason,meta) "
              + "VALUES ($1,$2,$3,$4,'failure','MFA_INVALID',$5)",
            [payload.email, challenge.user_id, ip ?? null, userAgent ?? null, { method: "authenticator_app" }],
          );
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid authenticator code." });
        }

        await markChallengeUsed(client, challenge.id);

        const userResult = await client.query<{ id: string; email: string | null; email_verified: boolean }>(
          "SELECT id,email,email_verified FROM iam.user_account WHERE id=$1",
          [challenge.user_id],
        );
        const user = userResult.rows[0];
        if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found." });

        await client.query("UPDATE iam.user_account SET last_login_at=now() WHERE id=$1", [challenge.user_id]);
        await client.query(
          "INSERT INTO iam.auth_attempt(email,user_id,ip,user_agent,outcome,reason,meta) "
            + "VALUES ($1,$2,$3,$4,'success',NULL,$5)",
          [user.email, challenge.user_id, ip ?? null, userAgent ?? null, { mfa_method: "authenticator_app" }],
        );

        return issueSessionForUser(client, user);
      });

      setSessionCookies(res, {
        refreshToken: session.refreshToken,
        csrfToken: session.csrfToken,
        maxAgeSeconds: config.refreshTokenTtlSeconds,
      });
      return json(res, 200, {
        ok: true,
        userId: session.userId,
        accessToken: session.accessToken,
        csrfToken: session.csrfToken,
      });
    } catch (err) {
      if (err instanceof TRPCError) return json(res, mapTrpcErrorToStatus(err), { ok: false, error: err.message });
      if (err instanceof z.ZodError) return json(res, 400, { ok: false, error: "Invalid request." });
      console.error("[auth.mfa.verify.totp]", err);
      return json(res, 500, { ok: false, error: "Internal error." });
    }
  });

  app.post("/auth/mfa/verify/passkey", async (req, res) => {
    try {
      const origin = requireAllowedOrigin(req);
      const input = verifyMfaPasskeySchema.parse(req.body);
      const authenticationResponse = isAuthenticationResponseJson(input.authenticationResponse)
        ? input.authenticationResponse
        : null;
      const ip = getRequestIp(req);
      const userAgent = getUserAgent(req);

      const session = await deps.identityDb.withTx(async (client) => {
        const challenge = await loadChallengeForUpdate(client, {
          token: input.challengeToken,
          expectedTypes: ["login"],
        });
        const payload = parseLoginChallengePayload(challenge.payload);
        if (!payload.allowed_methods.includes("passkey")) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Passkey is not enabled for this challenge." });
        }
        if (!payload.passkey_challenge) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Passkey challenge is unavailable." });
        }
        if (!authenticationResponse) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid passkey response payload." });
        }
        const credentialId = typeof authenticationResponse["id"] === "string"
          ? authenticationResponse["id"]
          : null;
        if (!credentialId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Missing passkey credential id." });
        }

        const credentialResult = await client.query<{
          user_id: string;
          credential_id: string;
          public_key: string;
          counter: string | number;
          transports: unknown;
        }>(
          "SELECT user_id,credential_id,public_key,counter,transports "
            + "FROM iam.webauthn_credential "
            + "WHERE credential_id=$1 AND revoked_at IS NULL "
            + "LIMIT 1",
          [credentialId],
        );
        const credential = credentialResult.rows[0];
        if (!credential || credential.user_id !== challenge.user_id) {
          await incrementChallengeAttempt(client, challenge.id);
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Unknown passkey credential." });
        }

        let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
        try {
          verification = await verifyAuthenticationResponse({
            response: authenticationResponse,
            expectedChallenge: payload.passkey_challenge,
            expectedOrigin: [origin, ...config.passkeyExpectedOrigins],
            expectedRPID: config.passkeyRpId,
            authenticator: {
              credentialID: credential.credential_id,
              credentialPublicKey: fromBase64Url(credential.public_key),
              counter: typeof credential.counter === "string"
                ? Number.parseInt(credential.counter, 10)
                : Number(credential.counter ?? 0),
              transports: normalizeTransportList(credential.transports) as (
                "ble"
                | "hybrid"
                | "internal"
                | "nfc"
                | "usb"
              )[],
            },
            requireUserVerification: true,
          });
        } catch (verifyError) {
          await incrementChallengeAttempt(client, challenge.id);
          await client.query(
            "INSERT INTO iam.auth_attempt(email,user_id,ip,user_agent,outcome,reason,meta) "
              + "VALUES ($1,$2,$3,$4,'failure','MFA_INVALID',$5)",
            [
              payload.email,
              challenge.user_id,
              ip ?? null,
              userAgent ?? null,
              { method: "passkey", error: verifyError instanceof Error ? verifyError.message : "verify_exception" },
            ],
          );
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: mapPasskeyVerificationErrorMessage(verifyError, "login"),
          });
        }

        if (!verification.verified) {
          await incrementChallengeAttempt(client, challenge.id);
          await client.query(
            "INSERT INTO iam.auth_attempt(email,user_id,ip,user_agent,outcome,reason,meta) "
              + "VALUES ($1,$2,$3,$4,'failure','MFA_INVALID',$5)",
            [payload.email, challenge.user_id, ip ?? null, userAgent ?? null, { method: "passkey" }],
          );
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Passkey verification failed." });
        }

        const newCounter = verification.authenticationInfo.newCounter;
        await client.query(
          "UPDATE iam.webauthn_credential "
            + "SET counter=$2,last_used_at=now(),updated_at=now() "
            + "WHERE credential_id=$1",
          [credential.credential_id, newCounter],
        );
        await markChallengeUsed(client, challenge.id);

        const userResult = await client.query<{ id: string; email: string | null; email_verified: boolean }>(
          "SELECT id,email,email_verified FROM iam.user_account WHERE id=$1",
          [challenge.user_id],
        );
        const user = userResult.rows[0];
        if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found." });

        await client.query("UPDATE iam.user_account SET last_login_at=now() WHERE id=$1", [challenge.user_id]);
        await client.query(
          "INSERT INTO iam.auth_attempt(email,user_id,ip,user_agent,outcome,reason,meta) "
            + "VALUES ($1,$2,$3,$4,'success',NULL,$5)",
          [user.email, challenge.user_id, ip ?? null, userAgent ?? null, { mfa_method: "passkey" }],
        );

        return issueSessionForUser(client, user);
      });

      setSessionCookies(res, {
        refreshToken: session.refreshToken,
        csrfToken: session.csrfToken,
        maxAgeSeconds: config.refreshTokenTtlSeconds,
      });
      return json(res, 200, {
        ok: true,
        userId: session.userId,
        accessToken: session.accessToken,
        csrfToken: session.csrfToken,
      });
    } catch (err) {
      if (err instanceof TRPCError) return json(res, mapTrpcErrorToStatus(err), { ok: false, error: err.message });
      if (err instanceof z.ZodError) return json(res, 400, { ok: false, error: "Invalid request." });
      console.error("[auth.mfa.verify.passkey]", err);
      return json(res, 500, { ok: false, error: "Internal error." });
    }
  });

  app.get("/auth/mfa/factors", async (req, res) => {
    try {
      const { userId } = requireAuthUserId(req);
      const totpResult = await deps.identityDb.query<{ enabled: boolean; verified_at: string | null }>(
        "SELECT is_active AS enabled,verified_at "
          + "FROM iam.mfa_totp_factor "
          + "WHERE user_id=$1 AND is_active=true AND disabled_at IS NULL "
          + "ORDER BY created_at DESC LIMIT 1",
        [userId],
      );
      const passkeyResult = await deps.identityDb.query<{
        credential_id: string;
        label: string | null;
        created_at: string;
        last_used_at: string | null;
      }>(
        "SELECT credential_id,label,created_at,last_used_at "
          + "FROM iam.webauthn_credential "
          + "WHERE user_id=$1 AND revoked_at IS NULL "
          + "ORDER BY created_at DESC",
        [userId],
      );
      return json(res, 200, {
        ok: true,
        factors: {
          authenticatorApp: {
            enabled: Boolean(totpResult.rows[0]?.enabled),
            verifiedAt: totpResult.rows[0]?.verified_at ?? null,
          },
          passkeys: passkeyResult.rows.map((row) => ({
            credentialId: row.credential_id,
            label: row.label,
            createdAt: row.created_at,
            lastUsedAt: row.last_used_at,
          })),
        },
      });
    } catch (err) {
      if (err instanceof TRPCError) return json(res, mapTrpcErrorToStatus(err), { ok: false, error: err.message });
      console.error("[auth.mfa.factors]", err);
      return json(res, 500, { ok: false, error: "Internal error." });
    }
  });

  app.post("/auth/mfa/totp/setup/start", async (req, res) => {
    try {
      requireAllowedOrigin(req);
      assertCsrf(req);
      const { userId } = requireAuthUserId(req);
      const userResult = await deps.identityDb.query<{ id: string; email: string | null }>(
        "SELECT id,email FROM iam.user_account WHERE id=$1",
        [userId],
      );
      const user = userResult.rows[0];
      if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });

      const issuer = "Taxinator";
      const label = user.email ?? user.id;
      const secretBase32 = authenticator.generateSecret();
      const otpauthUri = authenticator.keyuri(label, issuer, secretBase32);
      const challenge = await deps.identityDb.withTx(async (client) => (
        upsertChallenge(client, {
          userId: user.id,
          challengeType: "totp_setup",
          payload: {
            user_id: user.id,
            secret_base32: secretBase32,
            issuer,
            label,
          } as TotpSetupChallengePayload,
          ttlSeconds: 10 * 60,
          maxAttempts: 10,
        })
      ));

      return json(res, 200, {
        ok: true,
        setupToken: challenge.token,
        secretBase32,
        otpauthUri,
        issuer,
        label,
      });
    } catch (err) {
      if (err instanceof TRPCError) return json(res, mapTrpcErrorToStatus(err), { ok: false, error: err.message });
      console.error("[auth.mfa.totp.setup.start]", err);
      return json(res, 500, { ok: false, error: "Internal error." });
    }
  });

  app.post("/auth/mfa/totp/setup/verify", async (req, res) => {
    try {
      requireAllowedOrigin(req);
      assertCsrf(req);
      const { userId } = requireAuthUserId(req);
      const input = verifyMfaTotpSetupSchema.parse(req.body);
      const code = requireTotpCode(input.code);

      await deps.identityDb.withTx(async (client) => {
        const challenge = await loadChallengeForUpdate(client, {
          token: input.setupToken,
          expectedTypes: ["totp_setup"],
        });
        if (challenge.user_id !== userId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Cannot verify MFA setup for another user." });
        }
        if (!isRecord(challenge.payload)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid MFA setup payload." });
        }
        const payload = challenge.payload as TotpSetupChallengePayload;
        const verified = authenticator.check(code, payload.secret_base32);
        if (!verified) {
          await incrementChallengeAttempt(client, challenge.id);
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid authenticator code." });
        }

        await client.query(
          "UPDATE iam.mfa_totp_factor "
            + "SET is_active=false,disabled_at=now(),updated_at=now() "
            + "WHERE user_id=$1 AND is_active=true AND disabled_at IS NULL",
          [userId],
        );
        await client.query(
          "INSERT INTO iam.mfa_totp_factor(user_id,secret_base32,issuer,label,is_active,verified_at) "
            + "VALUES ($1,$2,$3,$4,true,now())",
          [userId, payload.secret_base32, payload.issuer, payload.label],
        );
        await markChallengeUsed(client, challenge.id);
        await client.query(
          "INSERT INTO iam.security_event(event_type,user_id,actor_user_id,ip,user_agent,meta) "
            + "VALUES ('MFA_TOTP_ENROLLED',$1,$1,$2,$3,$4)",
          [userId, getRequestIp(req) ?? null, getUserAgent(req) ?? null, {}],
        );
      });

      return json(res, 200, { ok: true });
    } catch (err) {
      if (err instanceof TRPCError) return json(res, mapTrpcErrorToStatus(err), { ok: false, error: err.message });
      if (err instanceof z.ZodError) return json(res, 400, { ok: false, error: "Invalid request." });
      console.error("[auth.mfa.totp.setup.verify]", err);
      return json(res, 500, { ok: false, error: "Internal error." });
    }
  });

  app.post("/auth/mfa/totp/disable", async (req, res) => {
    try {
      requireAllowedOrigin(req);
      assertCsrf(req);
      const { userId } = requireAuthUserId(req);
      const result = await deps.identityDb.query<{ id: string }>(
        "UPDATE iam.mfa_totp_factor "
          + "SET is_active=false,disabled_at=now(),updated_at=now() "
          + "WHERE user_id=$1 AND is_active=true AND disabled_at IS NULL "
          + "RETURNING id",
        [userId],
      );
      if (!result.rows[0]) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No active authenticator app setup found." });
      }
      await deps.identityDb.query(
        "INSERT INTO iam.security_event(event_type,user_id,actor_user_id,ip,user_agent,meta) "
          + "VALUES ('MFA_TOTP_REMOVED',$1,$1,$2,$3,$4)",
        [userId, getRequestIp(req) ?? null, getUserAgent(req) ?? null, {}],
      );
      return json(res, 200, { ok: true });
    } catch (err) {
      if (err instanceof TRPCError) return json(res, mapTrpcErrorToStatus(err), { ok: false, error: err.message });
      console.error("[auth.mfa.totp.disable]", err);
      return json(res, 500, { ok: false, error: "Internal error." });
    }
  });

  app.post("/auth/mfa/passkey/setup/start", async (req, res) => {
    try {
      requireAllowedOrigin(req);
      assertCsrf(req);
      const { userId } = requireAuthUserId(req);
      const input = startMfaPasskeySetupSchema.parse(req.body ?? {});

        const setupResult = await deps.identityDb.withTx(async (client) => {
        const userResult = await client.query<{ id: string; email: string | null; display_name: string | null }>(
          "SELECT id,email,display_name FROM iam.user_account WHERE id=$1",
          [userId],
        );
        const user = userResult.rows[0];
        if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });

        const credentialsResult = await client.query<{ credential_id: string }>(
          "SELECT credential_id FROM iam.webauthn_credential WHERE user_id=$1 AND revoked_at IS NULL",
          [userId],
        );

        const options = await generateRegistrationOptions({
          rpName: config.passkeyRpName,
          rpID: config.passkeyRpId,
          userID: Uint8Array.from(Buffer.from(user.id, "utf8")),
          userName: user.email ?? user.id,
          userDisplayName: user.display_name ?? user.email ?? "User",
          timeout: 60_000,
          attestationType: "none",
          authenticatorSelection: {
            residentKey: "preferred",
            userVerification: "required",
          },
          excludeCredentials: credentialsResult.rows.map((row) => ({
            id: row.credential_id,
          })),
        });

        const challenge = await upsertChallenge(client, {
          userId: user.id,
          challengeType: "passkey_setup",
          payload: {
            user_id: user.id,
            expected_challenge: options.challenge,
            ...(input.label ? { label: input.label } : {}),
          } as PasskeySetupChallengePayload,
          ttlSeconds: 10 * 60,
          maxAttempts: 8,
        });

        return { setupToken: challenge.token, options };
      });

      return json(res, 200, {
        ok: true,
        setupToken: setupResult.setupToken,
        options: setupResult.options,
      });
    } catch (err) {
      if (err instanceof TRPCError) return json(res, mapTrpcErrorToStatus(err), { ok: false, error: err.message });
      if (err instanceof z.ZodError) return json(res, 400, { ok: false, error: "Invalid request." });
      console.error("[auth.mfa.passkey.setup.start]", err);
      return json(res, 500, { ok: false, error: "Internal error." });
    }
  });

  app.post("/auth/mfa/passkey/setup/verify", async (req, res) => {
    try {
      const origin = requireAllowedOrigin(req);
      assertCsrf(req);
      const { userId } = requireAuthUserId(req);
      const input = verifyMfaPasskeySetupSchema.parse(req.body);
      const registrationResponse = isRegistrationResponseJson(input.registrationResponse)
        ? input.registrationResponse
        : null;
      if (!registrationResponse) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid passkey registration response." });
      }

      const result = await deps.identityDb.withTx(async (client) => {
        const challenge = await loadChallengeForUpdate(client, {
          token: input.setupToken,
          expectedTypes: ["passkey_setup"],
        });
        if (challenge.user_id !== userId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Cannot verify passkey setup for another user." });
        }
        if (!isRecord(challenge.payload)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid passkey setup payload." });
        }
        const payload = challenge.payload as PasskeySetupChallengePayload;

        let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
        try {
          verification = await verifyRegistrationResponse({
            response: registrationResponse,
            expectedChallenge: payload.expected_challenge,
            expectedOrigin: [origin, ...config.passkeyExpectedOrigins],
            expectedRPID: config.passkeyRpId,
            requireUserVerification: true,
          });
        } catch (verifyError) {
          await incrementChallengeAttempt(client, challenge.id);
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: mapPasskeyVerificationErrorMessage(verifyError, "setup"),
          });
        }
        if (!verification.verified || !verification.registrationInfo) {
          await incrementChallengeAttempt(client, challenge.id);
          throw new TRPCError({ code: "BAD_REQUEST", message: "Passkey registration could not be verified." });
        }

        const registrationInfo = verification.registrationInfo;
        const credentialId = registrationInfo.credentialID;
        const publicKey = toBase64Url(registrationInfo.credentialPublicKey);
        const counter = registrationInfo.counter;
        const transports = normalizeTransportList(registrationResponse.response.transports);
        const transportsJson = JSON.stringify(transports);
        const label = input.label ?? payload.label ?? null;

        await client.query(
          "INSERT INTO iam.webauthn_credential("
            + "user_id,credential_id,public_key,counter,device_type,backed_up,transports,label"
            + ") VALUES ($1,$2,$3,$4,$5,$6,$7,$8) "
            + "ON CONFLICT (credential_id) DO UPDATE SET "
            + "user_id=EXCLUDED.user_id,public_key=EXCLUDED.public_key,counter=EXCLUDED.counter,"
            + "device_type=EXCLUDED.device_type,backed_up=EXCLUDED.backed_up,transports=EXCLUDED.transports,"
            + "label=EXCLUDED.label,revoked_at=NULL,updated_at=now()",
          [
            userId,
            credentialId,
            publicKey,
            counter,
            registrationInfo.credentialDeviceType ?? null,
            registrationInfo.credentialBackedUp ?? null,
            transportsJson,
            label,
          ],
        );
        await markChallengeUsed(client, challenge.id);
        await client.query(
          "INSERT INTO iam.security_event(event_type,user_id,actor_user_id,ip,user_agent,meta) "
            + "VALUES ('MFA_PASSKEY_ENROLLED',$1,$1,$2,$3,$4)",
          [userId, getRequestIp(req) ?? null, getUserAgent(req) ?? null, { credential_id: credentialId }],
        );

        return { credentialId };
      });

      return json(res, 200, {
        ok: true,
        credentialId: result.credentialId,
      });
    } catch (err) {
      if (err instanceof TRPCError) return json(res, mapTrpcErrorToStatus(err), { ok: false, error: err.message });
      if (err instanceof z.ZodError) return json(res, 400, { ok: false, error: "Invalid request." });
      console.error("[auth.mfa.passkey.setup.verify]", err);
      return json(res, 500, { ok: false, error: "Internal error." });
    }
  });

  app.post("/auth/mfa/passkey/remove", async (req, res) => {
    try {
      requireAllowedOrigin(req);
      assertCsrf(req);
      const { userId } = requireAuthUserId(req);
      const input = removeMfaPasskeySchema.parse(req.body);
      const result = await deps.identityDb.query<{ credential_id: string }>(
        "UPDATE iam.webauthn_credential "
          + "SET revoked_at=now(),updated_at=now() "
          + "WHERE user_id=$1 AND credential_id=$2 AND revoked_at IS NULL "
          + "RETURNING credential_id",
        [userId, input.credentialId],
      );
      if (!result.rows[0]) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Passkey credential was not found." });
      }
      await deps.identityDb.query(
        "INSERT INTO iam.security_event(event_type,user_id,actor_user_id,ip,user_agent,meta) "
          + "VALUES ('MFA_PASSKEY_REMOVED',$1,$1,$2,$3,$4)",
        [userId, getRequestIp(req) ?? null, getUserAgent(req) ?? null, { credential_id: input.credentialId }],
      );
      return json(res, 200, { ok: true });
    } catch (err) {
      if (err instanceof TRPCError) return json(res, mapTrpcErrorToStatus(err), { ok: false, error: err.message });
      if (err instanceof z.ZodError) return json(res, 400, { ok: false, error: "Invalid request." });
      console.error("[auth.mfa.passkey.remove]", err);
      return json(res, 500, { ok: false, error: "Internal error." });
    }
  });

  app.get("/auth/csrf", async (req, res) => {
    try {
      requireAllowedOrigin(req);

      const cookies = parseCookies(req.headers.cookie);
      const refreshToken = cookies[config.cookieNameRefresh];
      if (!refreshToken) throw new TRPCError({ code: "UNAUTHORIZED", message: "Missing refresh token." });

      const csrfToken = cookies[config.cookieNameCsrf] ?? randomToken(18);
      setCsrfCookie(res, { csrfToken, maxAgeSeconds: config.refreshTokenTtlSeconds });

      return json(res, 200, { ok: true, csrfToken });
    } catch (err) {
      if (err instanceof TRPCError) return json(res, mapTrpcErrorToStatus(err), { ok: false, error: err.message });
      console.error("[auth.csrf]", err);
      return json(res, 500, { ok: false, error: "Internal error." });
    }
  });

  app.post("/auth/refresh", async (req, res) => {
    try {
      requireAllowedOrigin(req);
      assertCsrf(req);

      const cookies = parseCookies(req.headers.cookie);
      const refreshToken = cookies[config.cookieNameRefresh];
      if (!refreshToken) throw new TRPCError({ code: "UNAUTHORIZED", message: "Missing refresh token." });

      const csrfToken = cookies[config.cookieNameCsrf] ?? randomToken(18);
      const ip = getRequestIp(req);
      const userAgent = getUserAgent(req);
      const rotated = await rotateRefreshToken(deps.identityDb, refreshToken, config.refreshTokenTtlSeconds, {
        ...(ip ? { ip } : {}),
        ...(userAgent ? { userAgent } : {}),
      });
      if (!rotated.ok) {
        clearSessionCookies(res);
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid session." });
      }

      const user = await deps.identityDb.query<{ id: string; email: string | null; email_verified: boolean }>(
        "SELECT id,email,email_verified FROM iam.user_account WHERE id=$1",
        [rotated.userId],
      );
      const u = user.rows[0];
      if (!u) {
        clearSessionCookies(res);
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid session." });
      }

      setSessionCookies(res, {
        refreshToken: rotated.refreshToken,
        csrfToken,
        maxAgeSeconds: config.refreshTokenTtlSeconds,
      });

      return json(res, 200, {
        ok: true,
        accessToken: signAccessToken({ sub: u.id, email: u.email, email_verified: u.email_verified }),
        csrfToken,
      });
    } catch (err) {
      if (err instanceof TRPCError) return json(res, mapTrpcErrorToStatus(err), { ok: false, error: err.message });
      console.error("[auth.refresh]", err);
      return json(res, 500, { ok: false, error: "Internal error." });
    }
  });

  app.post("/auth/password/reset/request", async (req, res) => {
    try {
      const origin = requireAllowedOrigin(req);
      const input = passwordResetRequestSchema.parse(req.body);

      const out = await deps.identityDb.withTx(async (client) => {
        const userResult = await client.query<{ id: string; email_verified: boolean; is_active: boolean }>(
          "SELECT id,email_verified,is_active FROM iam.user_account WHERE email=$1",
          [input.email],
        );
        const user = userResult.rows[0];
        if (!user) {
          return {
            ok: true as const,
            devAccountFound: false,
            devResetAllowed: false,
          };
        }

        if (!user.is_active || !user.email_verified) {
          return {
            ok: true as const,
            devAccountFound: true,
            devResetAllowed: false,
          };
        }

        const resetToken = randomToken(32);
        const resetCode = generateEmailTaskCode();
        const resetTokenHash = sha256Base64Url(resetToken);
        const resetCodeHash = sha256Base64Url(resetCode);
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        const inserted = await client.query<{ id: string }>(
          "INSERT INTO iam.password_reset_token(user_id,token_hash,code_hash,expires_at) VALUES ($1,$2,$3,$4) RETURNING id",
          [user.id, resetTokenHash, resetCodeHash, expiresAt],
        );
        const tokenId = inserted.rows[0]?.id;
        if (!tokenId) throw new Error("Failed to create reset token.");

        await insertOutboxEvent(
          (s, p) => client.query(s, p),
          "identity.password_reset",
          `password_reset:${tokenId}`,
          {
            user_id: user.id,
            to_email: input.email,
            reset_token: resetToken,
            reset_code: resetCode,
            origin,
          },
        );

        return {
          ok: true as const,
          resetToken,
          resetCode,
          devAccountFound: true,
          devResetAllowed: true,
        };
      });

      return json(
        res,
        200,
        {
          ok: true,
          ...(shouldExposeDevCodes
            ? {
                dev_account_found: out.devAccountFound,
                dev_reset_allowed: out.devResetAllowed,
              }
            : {}),
          ...(shouldExposeDevCodes && out.resetToken && out.resetCode
            ? { dev_reset_token: out.resetToken, dev_reset_code: out.resetCode }
            : {}),
        },
      );
    } catch (err) {
      if (err instanceof TRPCError) return json(res, mapTrpcErrorToStatus(err), { ok: false, error: err.message });
      if (err instanceof z.ZodError) return json(res, 400, { ok: false, error: "Invalid request." });
      console.error("[auth.password.reset.request]", err);
      return json(res, 500, { ok: false, error: "Internal error." });
    }
  });

  app.post("/auth/password/reset/confirm", async (req, res) => {
    try {
      assertAllowedOriginIfPresent(req);
      const input = passwordResetConfirmSchema.parse(req.body);
      const tokenHash = input.token ? sha256Base64Url(input.token) : null;
      const resetCode = input.code ? requireEmailTaskCode(input.code, "Password reset code") : null;
      const resetCodeHash = resetCode ? sha256Base64Url(resetCode) : null;
      const email = input.email?.trim().toLowerCase() ?? null;

      const { accessToken, refreshToken, csrfToken, userId } = await deps.identityDb.withTx(async (client) => {
        type PasswordResetTokenRow = { id: string; user_id: string };
        let tokenRow: PasswordResetTokenRow | undefined;
        if (tokenHash) {
          const tokenResult = await client.query<PasswordResetTokenRow>(
            "SELECT id,user_id FROM iam.password_reset_token "
              + "WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now() "
              + "ORDER BY created_at DESC LIMIT 1",
            [tokenHash],
          );
          tokenRow = tokenResult.rows[0];
        } else {
          if (!email || !resetCodeHash) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Password reset code is required." });
          }
          const codeResult = await client.query<PasswordResetTokenRow>(
            "SELECT prt.id,prt.user_id "
              + "FROM iam.password_reset_token prt "
              + "JOIN iam.user_account ua ON ua.id=prt.user_id "
              + "WHERE lower(ua.email)=lower($1) "
              + "  AND prt.code_hash=$2 "
              + "  AND prt.used_at IS NULL "
              + "  AND prt.expires_at > now() "
              + "ORDER BY prt.created_at DESC LIMIT 1",
            [email, resetCodeHash],
          );
          tokenRow = codeResult.rows[0];
        }
        if (!tokenRow) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired reset credential." });

        await client.query("UPDATE iam.password_reset_token SET used_at=now() WHERE id=$1", [tokenRow.id]);

        const { hash, algo } = await hashPassword(input.password);
        await client.query(
          "INSERT INTO iam.password_credential(user_id,password_hash,algo) VALUES ($1,$2,$3) "
            + "ON CONFLICT (user_id) DO UPDATE SET password_hash=EXCLUDED.password_hash, algo=EXCLUDED.algo, updated_at=now()",
          [tokenRow.user_id, hash, algo],
        );

        await client.query(
          "INSERT INTO iam.security_event(event_type,user_id,ip,user_agent,meta) VALUES ('PASSWORD_CHANGED',$1,$2,$3,$4)",
          [tokenRow.user_id, getRequestIp(req) ?? null, getUserAgent(req) ?? null, {}],
        );

        await client.query("DELETE FROM oidc.store WHERE model=$1 AND user_id=$2", ["RefreshToken", tokenRow.user_id]);

        const user = await client.query<{ id: string; email: string | null; email_verified: boolean }>(
          "SELECT id,email,email_verified FROM iam.user_account WHERE id=$1",
          [tokenRow.user_id],
        );
        const u = user.rows[0];
        if (!u) throw new Error("User not found.");

        const { refreshToken } = await issueRefreshToken(client, u.id, config.refreshTokenTtlSeconds);
        const csrfToken = randomToken(18);

        return {
          userId: u.id,
          accessToken: signAccessToken({ sub: u.id, email: u.email, email_verified: u.email_verified }),
          refreshToken,
          csrfToken,
        };
      });

      setSessionCookies(res, {
        refreshToken,
        csrfToken,
        maxAgeSeconds: config.refreshTokenTtlSeconds,
      });

      return json(res, 200, { ok: true, userId, accessToken, csrfToken });
    } catch (err) {
      if (err instanceof TRPCError) return json(res, mapTrpcErrorToStatus(err), { ok: false, error: err.message });
      if (err instanceof z.ZodError) return json(res, 400, { ok: false, error: "Invalid request." });
      console.error("[auth.password.reset.confirm]", err);
      return json(res, 500, { ok: false, error: "Internal error." });
    }
  });

  app.post("/auth/password/change", async (req, res) => {
    try {
      requireAllowedOrigin(req);
      assertCsrf(req);
      const { userId } = requireAuthUserId(req);
      const input = passwordChangeSchema.parse(req.body);

      await deps.identityDb.withTx(async (client) => {
        const cred = await client.query<{ password_hash: string }>(
          "SELECT password_hash FROM iam.password_credential WHERE user_id=$1",
          [userId],
        );
        const row = cred.rows[0];
        if (!row) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Password login is not enabled for this account.",
          });
        }
        const isCurrentPasswordValid = await verifyPassword(row.password_hash, input.currentPassword);
        if (!isCurrentPasswordValid) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Current password is incorrect.",
          });
        }

        const { hash, algo } = await hashPassword(input.newPassword);
        await client.query(
          "UPDATE iam.password_credential "
            + "SET password_hash=$2, algo=$3, updated_at=now() "
            + "WHERE user_id=$1",
          [userId, hash, algo],
        );
        await client.query(
          "INSERT INTO iam.security_event(event_type,user_id,actor_user_id,ip,user_agent,meta) VALUES ('PASSWORD_CHANGED',$1,$1,$2,$3,$4)",
          [userId, getRequestIp(req) ?? null, getUserAgent(req) ?? null, { method: "self_change" }],
        );
      });

      return json(res, 200, { ok: true });
    } catch (err) {
      if (err instanceof TRPCError) return json(res, mapTrpcErrorToStatus(err), { ok: false, error: err.message });
      if (err instanceof z.ZodError) return json(res, 400, { ok: false, error: "Invalid request." });
      console.error("[auth.password.change]", err);
      return json(res, 500, { ok: false, error: "Internal error." });
    }
  });

  app.post("/auth/logout", async (req, res) => {
    try {
      requireAllowedOrigin(req);
      assertCsrf(req);
      const cookies = parseCookies(req.headers.cookie);
      const refreshToken = cookies[config.cookieNameRefresh];
      if (refreshToken) await revokeRefreshToken(deps.identityDb, refreshToken);
      clearSessionCookies(res);
      return json(res, 200, { ok: true });
    } catch (err) {
      if (err instanceof TRPCError) return json(res, mapTrpcErrorToStatus(err), { ok: false, error: err.message });
      console.error("[auth.logout]", err);
      return json(res, 500, { ok: false, error: "Internal error." });
    }
  });

  app.get("/auth/me", async (req, res) => {
    try {
      const { userId } = requireAuthUserId(req);
      const result = await deps.identityDb.query<{
        id: string;
        email: string | null;
        email_verified: boolean;
        display_name: string | null;
        phone: string | null;
        avatar_url: string | null;
        is_active: boolean;
      }>(
        "SELECT id,email,email_verified,display_name,phone,avatar_url,is_active FROM iam.user_account WHERE id=$1",
        [userId],
      );
      const user = result.rows[0];
      if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
      return json(res, 200, { ok: true, user });
    } catch (err) {
      if (err instanceof TRPCError) return json(res, mapTrpcErrorToStatus(err), { ok: false, error: err.message });
      console.error("[auth.me]", err);
      return json(res, 500, { ok: false, error: "Internal error." });
    }
  });

  // Avatar upload route is omitted in v1 — taxinator uses on-disk storage
  // under UPLOAD_DIR/<tenantId>/, not pre-signed S3 URLs. See plan: "File
  // storage (v1: on disk)". Re-enable once we adopt object storage.

  app.patch("/auth/me", async (req, res) => {
    try {
      requireAllowedOrigin(req);
      assertCsrf(req);
      const { userId } = requireAuthUserId(req);
      const input = updateMeSchema.parse(req.body);

      const result = await deps.identityDb.query<{
        id: string;
        email: string | null;
        email_verified: boolean;
        display_name: string | null;
        phone: string | null;
        avatar_url: string | null;
        is_active: boolean;
      }>(
        "UPDATE iam.user_account SET "
          + "display_name=CASE WHEN $2::boolean THEN $3 ELSE display_name END, "
          + "avatar_url=CASE WHEN $4::boolean THEN $5 ELSE avatar_url END, "
          + "phone=CASE WHEN $6::boolean THEN $7 ELSE phone END, "
          + "updated_at=now() "
          + "WHERE id=$1 "
          + "RETURNING id,email,email_verified,display_name,phone,avatar_url,is_active",
        [
          userId,
          input.displayName !== undefined,
          input.displayName ?? null,
          input.avatarUrl !== undefined,
          input.avatarUrl ?? null,
          input.phone !== undefined,
          input.phone ?? null,
        ],
      );
      const user = result.rows[0];
      if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });

      return json(res, 200, { ok: true, user });
    } catch (err) {
      if (err instanceof TRPCError) return json(res, mapTrpcErrorToStatus(err), { ok: false, error: err.message });
      if (err instanceof z.ZodError) return json(res, 400, { ok: false, error: "Invalid request." });
      console.error("[auth.me.patch]", err);
      return json(res, 500, { ok: false, error: "Internal error." });
    }
  });

  app.get("/auth/health", (_req, res) => json(res, 200, { ok: true }));

  app.get("/auth/oauth/google/start", async (req, res) => {
    try {
      if (!config.oauthGoogleEnabled) return json(res, 404, { ok: false, error: "Not found." });
      const returnToRaw = getSingleQueryParam(req.query["returnTo"]);
      if (!returnToRaw) throw new TRPCError({ code: "BAD_REQUEST", message: "Missing returnTo." });
      const returnTo = requireAllowedReturnTo(returnToRaw);

      const codeVerifier = randomToken(32);
      const { state, codeChallenge } = await createOauthState(deps.identityDb, {
        v: 1,
        kind: "oauth_login",
        provider: "google",
        code_verifier: codeVerifier,
        return_to: returnTo,
      });

      const clientId = requireConfigured(config.oauthGoogleClientId, "OAUTH_GOOGLE_CLIENT_ID");
      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("redirect_uri", config.oauthGoogleRedirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", "openid email profile");
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("code_challenge", codeChallenge);
      authUrl.searchParams.set("code_challenge_method", "S256");

      res.setHeader("Cache-Control", "no-store");
      return res.redirect(authUrl.toString());
    } catch (err) {
      if (err instanceof TRPCError) return json(res, mapTrpcErrorToStatus(err), { ok: false, error: err.message });
      console.error("[auth.oauth.google.start]", err);
      return json(res, 500, { ok: false, error: "Internal error." });
    }
  });

  app.get("/auth/oauth/google/callback", async (req, res) => {
    const code = getSingleQueryParam(req.query["code"]);
    const state = getSingleQueryParam(req.query["state"]);
    const error = getSingleQueryParam(req.query["error"]);
    const ip = getRequestIp(req);
    const userAgent = getUserAgent(req);

    try {
      if (!config.oauthGoogleEnabled) return json(res, 404, { ok: false, error: "Not found." });
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: "Google OAuth error." });
      if (!code || !state) throw new TRPCError({ code: "BAD_REQUEST", message: "Missing code/state." });

      const stored = await consumeOauthState(deps.identityDb, { state, provider: "google" });
      const returnTo = requireAllowedReturnTo(stored.return_to);

      const profile = await exchangeGoogleCode({ code, codeVerifier: stored.code_verifier });
      const email = profile.email ?? null;
      const emailVerifiedFromProvider = Boolean(profile.email && profile.email_verified);

      const result = await deps.identityDb.withTx(async (client) => {
        const provider = await client.query<{ id: string; trust_email_verified: boolean; allow_linking: boolean }>(
          "SELECT id,trust_email_verified,allow_linking FROM iam.identity_provider WHERE code=$1",
          ["google"],
        );
        const providerRow = provider.rows[0];
        if (!providerRow) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Provider not configured." });

        const existingIdentity = await client.query<{ user_id: string }>(
          "SELECT user_id FROM iam.auth_identity WHERE provider_id=$1 AND subject=$2",
          [providerRow.id, profile.sub],
        );
        const authIdentityWasNew = !existingIdentity.rows[0]?.user_id;

        const canTrustEmail = providerRow.trust_email_verified && emailVerifiedFromProvider;
        const canLinkByEmail = providerRow.allow_linking && canTrustEmail && email;

        const ensuredUserId = await (async () => {
          const fromIdentity = existingIdentity.rows[0]?.user_id;
          if (fromIdentity) return { userId: fromIdentity, linked: false };

          if (canLinkByEmail) {
            const byEmail = await client.query<{ id: string; is_active: boolean; disabled_reason: string | null }>(
              "SELECT id,is_active,disabled_reason FROM iam.user_account WHERE email=$1",
              [email],
            );
            const u = byEmail.rows[0];
            if (u) {
              if (!u.is_active) throw new TRPCError({ code: "FORBIDDEN", message: "Account disabled." });
              return { userId: u.id, linked: true };
            }
          }

          const created = await client.query<{ id: string }>(
            "INSERT INTO iam.user_account(email,email_verified,display_name,avatar_url,is_active) VALUES ($1,$2,$3,$4,true) RETURNING id",
            [email, canTrustEmail, profile.name ?? null, profile.picture ?? null],
          );
          const newId = created.rows[0]?.id;
          if (!newId) throw new Error("Failed to create user.");
          return { userId: newId, linked: true };
        })();

        const userId = ensuredUserId.userId;

        const profileJson: Record<string, string> = {};
        if (profile.email) profileJson["email"] = profile.email;
        if (profile.name) profileJson["name"] = profile.name;
        if (profile.picture) profileJson["picture"] = profile.picture;

        const insertedIdentity = await client.query(
          "INSERT INTO iam.auth_identity(user_id,provider_id,subject,profile,last_login_at) "
            + "VALUES ($1,$2,$3,$4,now()) ON CONFLICT (provider_id,subject) DO UPDATE "
            + "SET last_login_at=now(), profile=EXCLUDED.profile RETURNING id",
          [userId, providerRow.id, profile.sub, profileJson],
        );
        void insertedIdentity;

        await client.query(
          "UPDATE iam.user_account SET "
            + "last_login_at=now(), "
            + "email=COALESCE(email,$2), "
            + "email_verified=CASE WHEN $3 THEN true ELSE email_verified END, "
            + "display_name=COALESCE(display_name,$4), "
            + "avatar_url=COALESCE(avatar_url,$5) "
            + "WHERE id=$1",
          [userId, email, canTrustEmail, profile.name ?? null, profile.picture ?? null],
        );

        const active = await client.query<{ is_active: boolean }>(
          "SELECT is_active FROM iam.user_account WHERE id=$1",
          [userId],
        );
        if (!active.rows[0]?.is_active) throw new TRPCError({ code: "FORBIDDEN", message: "Account disabled." });

        await client.query(
          "INSERT INTO iam.auth_attempt(email,user_id,ip,user_agent,outcome,reason,meta) VALUES ($1,$2,$3,$4,'success',NULL,$5)",
          [email, userId, ip ?? null, userAgent ?? null, { provider: "google", subject: profile.sub }],
        );
        if (authIdentityWasNew) {
          await client.query(
            "INSERT INTO iam.security_event(event_type,user_id,ip,user_agent,meta) VALUES ('IDENTITY_LINKED',$1,$2,$3,$4)",
            [userId, ip ?? null, userAgent ?? null, { provider: "google", subject: profile.sub }],
          );
        }

        const user = await client.query<{ email: string | null; email_verified: boolean }>(
          "SELECT email,email_verified FROM iam.user_account WHERE id=$1",
          [userId],
        );
        const u = user.rows[0];
        if (!u) throw new Error("User not found.");

        const { refreshToken } = await issueRefreshToken(client, userId, config.refreshTokenTtlSeconds);
        const csrfToken = randomToken(18);

        return {
          userId,
          accessToken: signAccessToken({ sub: userId, email: u.email, email_verified: u.email_verified }),
          refreshToken,
          csrfToken,
        };
      });

      try {
        await ensurePersonalTenantForUser({ userId: result.userId });
      } catch (error) {
        console.error("[auth.oauth.google.callback][default-customer-access]", error);
      }

      setSessionCookies(res, {
        refreshToken: result.refreshToken,
        csrfToken: result.csrfToken,
        maxAgeSeconds: config.refreshTokenTtlSeconds,
      });

      const redirectUrl = new URL(returnTo);
      redirectUrl.searchParams.set("oauth", "success");
      redirectUrl.searchParams.set("provider", "google");
      res.setHeader("Cache-Control", "no-store");
      return res.redirect(redirectUrl.toString());
    } catch (err) {
      try {
        await deps.identityDb.query(
          "INSERT INTO iam.auth_attempt(email,ip,user_agent,outcome,reason,meta) VALUES ($1,$2,$3,'failure','OIDC_ERROR',$4)",
          [null, ip ?? null, userAgent ?? null, { provider: "google", error: err instanceof Error ? err.message : "unknown" }],
        );
      } catch {
        // ignore secondary failure
      }
      if (err instanceof TRPCError) return json(res, mapTrpcErrorToStatus(err), { ok: false, error: err.message });
      console.error("[auth.oauth.google.callback]", err);
      return json(res, 500, { ok: false, error: "Internal error." });
    }
  });

  app.get("/auth/oauth/twitter/start", async (req, res) => {
    try {
      if (!config.oauthTwitterEnabled) return json(res, 404, { ok: false, error: "Not found." });
      const returnToRaw = getSingleQueryParam(req.query["returnTo"]);
      if (!returnToRaw) throw new TRPCError({ code: "BAD_REQUEST", message: "Missing returnTo." });
      const returnTo = requireAllowedReturnTo(returnToRaw);

      const codeVerifier = randomToken(32);
      const { state, codeChallenge } = await createOauthState(deps.identityDb, {
        v: 1,
        kind: "oauth_login",
        provider: "twitter",
        code_verifier: codeVerifier,
        return_to: returnTo,
      });

      const clientId = requireConfigured(config.oauthTwitterClientId, "OAUTH_TWITTER_CLIENT_ID");
      const authUrl = new URL("https://twitter.com/i/oauth2/authorize");
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("redirect_uri", config.oauthTwitterRedirectUri);
      authUrl.searchParams.set("scope", "users.read");
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("code_challenge", codeChallenge);
      authUrl.searchParams.set("code_challenge_method", "S256");

      res.setHeader("Cache-Control", "no-store");
      return res.redirect(authUrl.toString());
    } catch (err) {
      if (err instanceof TRPCError) return json(res, mapTrpcErrorToStatus(err), { ok: false, error: err.message });
      console.error("[auth.oauth.twitter.start]", err);
      return json(res, 500, { ok: false, error: "Internal error." });
    }
  });

  app.get("/auth/oauth/twitter/callback", async (req, res) => {
    const code = getSingleQueryParam(req.query["code"]);
    const state = getSingleQueryParam(req.query["state"]);
    const error = getSingleQueryParam(req.query["error"]);
    const ip = getRequestIp(req);
    const userAgent = getUserAgent(req);

    try {
      if (!config.oauthTwitterEnabled) return json(res, 404, { ok: false, error: "Not found." });
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: "Twitter OAuth error." });
      if (!code || !state) throw new TRPCError({ code: "BAD_REQUEST", message: "Missing code/state." });

      const stored = await consumeOauthState(deps.identityDb, { state, provider: "twitter" });
      const returnTo = requireAllowedReturnTo(stored.return_to);

      const twitterUser = await exchangeTwitterCode({ code, codeVerifier: stored.code_verifier });

      const result = await deps.identityDb.withTx(async (client) => {
        const provider = await client.query<{ id: string }>(
          "SELECT id FROM iam.identity_provider WHERE code=$1",
          ["twitter"],
        );
        const providerRow = provider.rows[0];
        if (!providerRow) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Provider not configured." });

        const existingIdentity = await client.query<{ user_id: string }>(
          "SELECT user_id FROM iam.auth_identity WHERE provider_id=$1 AND subject=$2",
          [providerRow.id, twitterUser.id],
        );
        const authIdentityWasNew = !existingIdentity.rows[0]?.user_id;

        const ensuredUserId = await (async () => {
          const fromIdentity = existingIdentity.rows[0]?.user_id;
          if (fromIdentity) return { userId: fromIdentity, linked: false };

          const created = await client.query<{ id: string }>(
            "INSERT INTO iam.user_account(email,email_verified,display_name,avatar_url,is_active) VALUES (NULL,false,$1,$2,true) RETURNING id",
            [twitterUser.name ?? null, twitterUser.profile_image_url ?? null],
          );
          const newId = created.rows[0]?.id;
          if (!newId) throw new Error("Failed to create user.");
          return { userId: newId, linked: true };
        })();

        const userId = ensuredUserId.userId;

        const profileJson: Record<string, string> = {};
        if (twitterUser.name) profileJson["name"] = twitterUser.name;
        if (twitterUser.profile_image_url) profileJson["picture"] = twitterUser.profile_image_url;

        const insertedIdentity = await client.query(
          "INSERT INTO iam.auth_identity(user_id,provider_id,subject,profile,last_login_at) "
            + "VALUES ($1,$2,$3,$4,now()) ON CONFLICT (provider_id,subject) DO UPDATE "
            + "SET last_login_at=now(), profile=EXCLUDED.profile RETURNING id",
          [userId, providerRow.id, twitterUser.id, profileJson],
        );
        void insertedIdentity;

        await client.query(
          "UPDATE iam.user_account SET last_login_at=now(), display_name=COALESCE(display_name,$2), avatar_url=COALESCE(avatar_url,$3) WHERE id=$1",
          [userId, twitterUser.name ?? null, twitterUser.profile_image_url ?? null],
        );

        const active = await client.query<{ is_active: boolean }>(
          "SELECT is_active FROM iam.user_account WHERE id=$1",
          [userId],
        );
        if (!active.rows[0]?.is_active) throw new TRPCError({ code: "FORBIDDEN", message: "Account disabled." });

        await client.query(
          "INSERT INTO iam.auth_attempt(email,user_id,ip,user_agent,outcome,reason,meta) VALUES ($1,$2,$3,$4,'success',NULL,$5)",
          [null, userId, ip ?? null, userAgent ?? null, { provider: "twitter", subject: twitterUser.id }],
        );
        if (authIdentityWasNew) {
          await client.query(
            "INSERT INTO iam.security_event(event_type,user_id,ip,user_agent,meta) VALUES ('IDENTITY_LINKED',$1,$2,$3,$4)",
            [userId, ip ?? null, userAgent ?? null, { provider: "twitter", subject: twitterUser.id }],
          );
        }

        const user = await client.query<{ email: string | null; email_verified: boolean }>(
          "SELECT email,email_verified FROM iam.user_account WHERE id=$1",
          [userId],
        );
        const u = user.rows[0];
        if (!u) throw new Error("User not found.");

        const { refreshToken } = await issueRefreshToken(client, userId, config.refreshTokenTtlSeconds);
        const csrfToken = randomToken(18);
        return {
          userId,
          accessToken: signAccessToken({ sub: userId, email: u.email, email_verified: u.email_verified }),
          refreshToken,
          csrfToken,
        };
      });

      try {
        await ensurePersonalTenantForUser({ userId: result.userId });
      } catch (error) {
        console.error("[auth.oauth.twitter.callback][default-customer-access]", error);
      }

      setSessionCookies(res, {
        refreshToken: result.refreshToken,
        csrfToken: result.csrfToken,
        maxAgeSeconds: config.refreshTokenTtlSeconds,
      });

      const redirectUrl = new URL(returnTo);
      redirectUrl.searchParams.set("oauth", "success");
      redirectUrl.searchParams.set("provider", "twitter");
      res.setHeader("Cache-Control", "no-store");
      return res.redirect(redirectUrl.toString());
    } catch (err) {
      try {
        await deps.identityDb.query(
          "INSERT INTO iam.auth_attempt(email,ip,user_agent,outcome,reason,meta) VALUES ($1,$2,$3,'failure','OIDC_ERROR',$4)",
          [null, ip ?? null, userAgent ?? null, { provider: "twitter", error: err instanceof Error ? err.message : "unknown" }],
        );
      } catch {
        // ignore secondary failure
      }
      if (err instanceof TRPCError) return json(res, mapTrpcErrorToStatus(err), { ok: false, error: err.message });
      console.error("[auth.oauth.twitter.callback]", err);
      return json(res, 500, { ok: false, error: "Internal error." });
    }
  });
};

const mapTrpcErrorToStatus = (err: TRPCError): number => {
  switch (err.code) {
    case "BAD_REQUEST":
      return 400;
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "CONFLICT":
      return 409;
    case "TOO_MANY_REQUESTS":
      return 429;
    case "PRECONDITION_FAILED":
      return 412;
    default:
      return 500;
  }
};
