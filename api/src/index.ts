import crypto from "node:crypto";
import cors from "cors";
import express from "express";
import { TRPCError } from "@trpc/server";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { createOpenApiExpressMiddleware } from "trpc-openapi";
import { mountAuthRoutes } from "./auth/routes.js";
import { isAllowedOrigin } from "./auth/origin.js";
import { getBearerToken, verifyAccessToken } from "./auth/jwt.js";
import { config } from "./config.js";
import { appDb } from "./db/appDb.js";
import { identityDb } from "./db/identityDb.js";
import { appRouterRoot } from "./routers/root.js";
import type { Context } from "./trpc.js";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", config.trustProxyHops);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, false);
      if (isAllowedOrigin(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Internal-API-Key", "X-CSRF-Token"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }),
);

app.use(express.json({ limit: "2mb" }));

mountAuthRoutes(app, { identityDb });

const TENANT_UUID_RE = /\/tenants\/([0-9a-fA-F-]{36})(?:\/|$)/;

const createContext = ({ req }: { req: express.Request }): Context => {
  const tenantIdFromUrl = (() => {
    const source = typeof req.originalUrl === "string" ? req.originalUrl : req.url;
    const match = source.match(TENANT_UUID_RE);
    if (match?.[1]) return match[1];
    const qs = typeof req.query?.["tenantId"] === "string" ? req.query["tenantId"] : null;
    if (qs && /^[0-9a-fA-F-]{36}$/.test(qs)) return qs;
    const body = req.body && typeof req.body === "object"
      && typeof (req.body as Record<string, unknown>)["tenantId"] === "string"
      ? ((req.body as Record<string, unknown>)["tenantId"] as string)
      : null;
    return body && /^[0-9a-fA-F-]{36}$/.test(body) ? body : null;
  })();

  const internalApiKeyHeader = req.headers["x-internal-api-key"];
  const internal = Boolean(
    config.internalApiKey
      && typeof internalApiKeyHeader === "string"
      && internalApiKeyHeader.length === config.internalApiKey.length
      && crypto.timingSafeEqual(
        Buffer.from(internalApiKeyHeader, "utf8"),
        Buffer.from(config.internalApiKey, "utf8"),
      ),
  );

  const bearer = getBearerToken(req.headers.authorization);
  const authUser = (() => {
    if (!bearer) return null;
    try {
      const claims = verifyAccessToken(bearer);
      return { userId: claims.sub, email: claims.email ?? null };
    } catch {
      return null;
    }
  })();

  return {
    appDb,
    identityDb,
    internal,
    authUser,
    req: {
      ip: req.ip ?? null,
      userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null,
      origin: typeof req.headers.origin === "string" ? req.headers.origin : null,
      tenantId: tenantIdFromUrl,
    },
  };
};

app.use(
  "/openapi",
  createOpenApiExpressMiddleware({
    router: appRouterRoot,
    createContext,
    responseMeta: () => ({}),
    onError({ error, path, type }: { error: unknown; path?: string; type?: string }) {
      const label = `[openapi] ${type ?? "unknown"} ${path ?? ""}`.trim();
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      console.error(label, message);
    },
    maxBodySize: 2 * 1024 * 1024,
  }),
);

app.use(
  "/trpc",
  createExpressMiddleware({
    router: appRouterRoot,
    createContext,
  }),
);

app.get("/healthz", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof TRPCError) {
    res.status(500).json({ ok: false, error: err.message });
    return;
  }
  console.error("[unhandled]", err);
  res.status(500).json({ ok: false, error: "Internal error." });
});

const host = process.env["HOST"] ?? (config.isProd ? "127.0.0.1" : "0.0.0.0");
app.listen(config.port, host, () => {
  console.log(`Taxinator API listening on ${config.baseUrl}`);
});
