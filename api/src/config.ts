import dotenv from "dotenv";
import fs from "node:fs";

dotenv.config();

const port = Number.parseInt(process.env["PORT"] ?? "4000", 10);
const nodeEnv = process.env["NODE_ENV"] ?? "development";
const isProd = nodeEnv === "production";
const trustProxyHops = Number.parseInt(process.env["TRUST_PROXY_HOPS"] ?? "1", 10);

const parseBool = (value: string | undefined): boolean => {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
};

const parseCsv = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

type SameSite = "None" | "Lax" | "Strict";
const parseSameSite = (value: string | undefined): SameSite | undefined => {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "none") return "None";
  if (normalized === "lax") return "Lax";
  if (normalized === "strict") return "Strict";
  return undefined;
};

const getJwtSecret = (): string => {
  const fromEnv = process.env["JWT_SECRET"]?.trim();
  if (fromEnv) return fromEnv;
  if (isProd) throw new Error("JWT_SECRET is required in production.");
  return "dev-insecure-jwt-secret-change-me";
};

const cookieSecure = process.env["COOKIE_SECURE"] ? parseBool(process.env["COOKIE_SECURE"]) : isProd;
const cookieSameSite = parseSameSite(process.env["COOKIE_SAMESITE"]) ?? (isProd ? "None" : "Lax");
if (cookieSameSite === "None" && !cookieSecure) {
  throw new Error("COOKIE_SAMESITE=None requires COOKIE_SECURE=true.");
}

const baseUrl = process.env["BASE_URL"] ?? `http://localhost:${port}`;
const publicOrigin = process.env["PUBLIC_ORIGIN"] ?? process.env["BASE_URL"] ?? `http://localhost:${port}`;
const defaultPasskeyRpId = (() => {
  try {
    return new URL(publicOrigin).hostname;
  } catch {
    return "localhost";
  }
})();
const dbSslCaFile = process.env["DB_SSL_CA_FILE"]?.trim();
const dbSslCaPem = dbSslCaFile ? fs.readFileSync(dbSslCaFile, "utf8") : undefined;

export const config = {
  port,
  nodeEnv,
  isProd,
  trustProxyHops: Number.isFinite(trustProxyHops) && trustProxyHops >= 0 ? trustProxyHops : 1,
  baseUrl,
  publicOrigin,
  internalApiKey: process.env["INTERNAL_API_KEY"],
  corsAllowedDomains: parseCsv(process.env["CORS_ALLOWED_DOMAINS"]),
  corsAllowNetlifyApp: parseBool(process.env["CORS_ALLOW_NETLIFY_APP"]),
  docsEnabled: process.env["DOCS_ENABLED"] ? parseBool(process.env["DOCS_ENABLED"]) : !isProd,
  jwtSecret: getJwtSecret(),
  accessTokenTtlSeconds: Number.parseInt(process.env["ACCESS_TOKEN_TTL_SECONDS"] ?? "900", 10),
  refreshTokenTtlSeconds: Number.parseInt(process.env["REFRESH_TOKEN_TTL_SECONDS"] ?? "2592000", 10),
  authExposeDevCodes: parseBool(process.env["AUTH_EXPOSE_DEV_CODES"]),
  cookieSecure,
  cookieSameSite,
  cookieNameRefresh: process.env["COOKIE_NAME_REFRESH"]?.trim()
    || (isProd ? "__Host-refresh_token" : "refresh_token"),
  cookieNameCsrf: process.env["COOKIE_NAME_CSRF"]?.trim()
    || (isProd ? "__Host-csrf_token" : "csrf_token"),
  tenantAdminRoles: parseCsv(process.env["TENANT_ADMIN_ROLES"] ?? "owner,admin"),
  platformAdminEmails: parseCsv(process.env["PLATFORM_ADMIN_EMAILS"]),
  appDbUrl: process.env["APP_DB_URL"] ?? "postgresql://postgres:postgres@localhost:5432/app_db",
  identityDbUrl: process.env["IDENTITY_DB_URL"] ?? "postgresql://postgres:postgres@localhost:5432/identity_db",
  appDbAdminUrl: process.env["APP_DB_ADMIN_URL"],
  identityDbAdminUrl: process.env["IDENTITY_DB_ADMIN_URL"],
  appDbSsl: parseBool(process.env["APP_DB_SSL"] ?? process.env["DB_SSL"]),
  identityDbSsl: parseBool(process.env["IDENTITY_DB_SSL"] ?? process.env["DB_SSL"]),
  dbSslInsecure: parseBool(process.env["DB_SSL_INSECURE"]),
  dbSslCaFile,
  dbSslCaPem,

  oauthStateTtlSeconds: Number.parseInt(process.env["OAUTH_STATE_TTL_SECONDS"] ?? "600", 10),
  oauthGoogleEnabled: parseBool(process.env["OAUTH_GOOGLE_ENABLED"]),
  oauthGoogleClientId: process.env["OAUTH_GOOGLE_CLIENT_ID"],
  oauthGoogleClientSecret: process.env["OAUTH_GOOGLE_CLIENT_SECRET"],
  oauthGoogleRedirectUri:
    process.env["OAUTH_GOOGLE_REDIRECT_URI"]
    ?? `${baseUrl}/auth/oauth/google/callback`,

  oauthTwitterEnabled: parseBool(process.env["OAUTH_TWITTER_ENABLED"]),
  oauthTwitterClientId: process.env["OAUTH_TWITTER_CLIENT_ID"],
  oauthTwitterClientSecret: process.env["OAUTH_TWITTER_CLIENT_SECRET"],
  oauthTwitterRedirectUri:
    process.env["OAUTH_TWITTER_REDIRECT_URI"]
    ?? `${baseUrl}/auth/oauth/twitter/callback`,

  passkeyRpId: process.env["PASSKEY_RP_ID"]?.trim() ?? defaultPasskeyRpId,
  passkeyRpName: process.env["PASSKEY_RP_NAME"]?.trim() ?? "Taxinator",
  passkeyExpectedOrigins: parseCsv(process.env["PASSKEY_EXPECTED_ORIGINS"] ?? publicOrigin),

  uploadDir: process.env["UPLOAD_DIR"]?.trim() ?? "./data/uploads",
};

export function makeSslConfig(enabled: true): { rejectUnauthorized: boolean; ca?: string };
export function makeSslConfig(enabled: false): undefined;
export function makeSslConfig(enabled: boolean): { rejectUnauthorized: boolean; ca?: string } | undefined {
  if (!enabled) return undefined;
  const ssl: { rejectUnauthorized: boolean; ca?: string } = {
    rejectUnauthorized: !config.dbSslInsecure,
  };
  if (config.dbSslCaPem) ssl.ca = config.dbSslCaPem;
  return ssl;
}
