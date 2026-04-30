import crypto from "node:crypto";
import type express from "express";
import { config } from "../config.js";

export const getRequestOrigin = (req: express.Request): string | undefined =>
  (req.headers.origin as string | undefined) ?? undefined;

export const getRequestIp = (req: express.Request): string | undefined =>
  typeof req.ip === "string" ? req.ip : undefined;

export const getUserAgent = (req: express.Request): string | undefined =>
  (req.headers["user-agent"] as string | undefined) ?? undefined;

export const parseCookies = (cookieHeader: string | undefined): Record<string, string> => {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    const key = rawKey?.trim();
    if (!key) continue;
    const value = rest.join("=");
    out[key] = decodeURIComponent(value ?? "");
  }
  return out;
};

type CookieOptions = {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "None" | "Lax" | "Strict";
  path?: string;
  maxAgeSeconds?: number;
};

export const serializeCookie = (name: string, value: string, opts: CookieOptions): string => {
  const parts: string[] = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${opts.path ?? "/"}`);
  if (opts.maxAgeSeconds !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(opts.maxAgeSeconds))}`);
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure ?? config.cookieSecure) parts.push("Secure");
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  return parts.join("; ");
};

export const randomToken = (bytes = 32): string =>
  crypto.randomBytes(bytes).toString("base64url");

export const sha256Base64Url = (value: string): string =>
  crypto.createHash("sha256").update(value).digest("base64url");

