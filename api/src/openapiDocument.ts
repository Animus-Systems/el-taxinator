import { generateOpenApiDocument } from "trpc-openapi";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { appRouterRoot } from "./routers/root.js";

// One OpenAPI document. Covers everything the UI talks to:
//   * identity.* — /openapi/identity/me, recent auth attempts
//   * tenants.* — list/create tenants, members, invites
//   * app.*     — every domain CRUD route from Phases 3–7
// Auth flows (register / login / refresh / verify) live under /auth/* as
// plain Express routes, not tRPC procedures, so they don't show up here.
// Their shapes are stable and the UI client hand-rolls them.

const readApiVersion = (): string => {
  try {
    const raw = readFileSync(resolve(process.cwd(), "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    if (typeof parsed.version === "string" && parsed.version.trim().length > 0) {
      return parsed.version.trim();
    }
  } catch {
    // Fall through to safe default.
  }
  return "0.0.0";
};

const API_VERSION = readApiVersion();

export const buildOpenApiDocument = (baseUrl: string) =>
  generateOpenApiDocument(appRouterRoot, {
    title: "Taxinator API",
    description:
      "Typed tRPC API with OpenAPI (REST) endpoints for the App DB and Identity DB. "
      + "Each route is documented with request/response examples.",
    version: API_VERSION,
    baseUrl,
  });

// Same content as buildOpenApiDocument — kept as a separate name so the
// generation script + Swagger UI can diverge later (e.g. dropping
// platform-admin endpoints from the public surface).
export const buildPublicApiOpenApiDocument = (baseUrl: string) =>
  buildOpenApiDocument(baseUrl);
