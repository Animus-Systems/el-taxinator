import { router } from "../trpc.js";
import { identityRouter } from "./identity.js";
import { tenantsRouter } from "./tenants.js";

// Phase 2 root router. Domain routers (transactions, invoices, etc.) get added
// in subsequent phases as their migrations land.
export const appRouterRoot = router({
  identity: identityRouter,
  tenants: tenantsRouter,
});

export type AppRouter = typeof appRouterRoot;
