import { router } from "../trpc.js";
import { appRouter } from "./app.js";
import { identityRouter } from "./identity.js";
import { tenantsRouter } from "./tenants.js";

// Phase 3 root router. `app` carries the domain CRUD (categories, projects,
// accounts, files, contacts, products); `tenants` covers tenancy/membership;
// `identity` is the lone identity_db-backed router.
export const appRouterRoot = router({
  identity: identityRouter,
  tenants: tenantsRouter,
  app: appRouter,
});

export type AppRouter = typeof appRouterRoot;
