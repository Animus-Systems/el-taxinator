import crypto from "node:crypto";
import { config } from "../config.js";

export type AccessTokenClaims = {
  sub: string;
  email?: string | null;
  email_verified?: boolean;
};

type JwtHeader = { alg: "HS256"; typ: "JWT" };
type JwtPayload = AccessTokenClaims & {
  iss: string;
  aud: string;
  iat: number;
  exp: number;
};

const base64UrlEncodeJson = (value: unknown): string =>
  Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

const base64UrlDecodeJson = <T>(value: string): T => {
  const json = Buffer.from(value, "base64url").toString("utf8");
  return JSON.parse(json) as T;
};

const hmacSha256Base64Url = (data: string, secret: string): string =>
  crypto.createHmac("sha256", secret).update(data).digest("base64url");

const timingSafeEqualString = (a: string, b: string): boolean => {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
};

export const signAccessToken = (claims: AccessTokenClaims): string => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    ...claims,
    iss: config.publicOrigin,
    aud: "api",
    iat: nowSeconds,
    exp: nowSeconds + config.accessTokenTtlSeconds,
  };

  const header: JwtHeader = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncodeJson(header);
  const encodedPayload = base64UrlEncodeJson(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = hmacSha256Base64Url(signingInput, config.jwtSecret);
  return `${signingInput}.${signature}`;
};

export const verifyAccessToken = (token: string): AccessTokenClaims => {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid token.");
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (!encodedHeader || !encodedPayload || !encodedSignature) throw new Error("Invalid token.");

  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = hmacSha256Base64Url(signingInput, config.jwtSecret);
  if (!timingSafeEqualString(encodedSignature, expectedSignature)) throw new Error("Invalid signature.");

  const header = base64UrlDecodeJson<JwtHeader>(encodedHeader);
  if (header.alg !== "HS256") throw new Error("Unsupported alg.");

  const payload = base64UrlDecodeJson<JwtPayload>(encodedPayload);
  if (payload.iss !== config.publicOrigin) throw new Error("Invalid issuer.");
  if (payload.aud !== "api") throw new Error("Invalid audience.");

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= nowSeconds) throw new Error("Token expired.");
  if (typeof payload.sub !== "string" || !payload.sub) throw new Error("Invalid subject.");

  const claims: AccessTokenClaims = { sub: payload.sub };
  if (typeof payload.email === "string" || payload.email === null) claims.email = payload.email;
  if (typeof payload.email_verified === "boolean") claims.email_verified = payload.email_verified;
  return claims;
};

export const getBearerToken = (authorization: string | undefined): string | undefined => {
  if (!authorization) return undefined;
  const [scheme, token] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer") return undefined;
  if (!token) return undefined;
  return token.trim();
};

