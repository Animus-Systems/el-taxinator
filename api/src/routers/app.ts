import { router } from "../trpc.js";
import { accountsRouter } from "./app/accounts.js";
import { aliasesRouter } from "./app/aliases.js";
import { categoriesRouter } from "./app/categories.js";
import { contactsRouter } from "./app/contacts.js";
import { filesRouter } from "./app/files.js";
import { importsRouter } from "./app/imports.js";
import { productsRouter } from "./app/products.js";
import { projectsRouter } from "./app/projects.js";
import { rulesRouter } from "./app/rules.js";
import { transactionsRouter } from "./app/transactions.js";

// Phase 4 domain routers — adds transactions, rules, vendor aliases, and
// import sessions on top of the Phase 3 boring-CRUD core. Multer-based file
// upload routes are mounted directly on Express via mountFileRoutes (see
// api/src/index.ts) because multer is middleware, not a tRPC procedure.
export const appRouter = router({
  accounts: accountsRouter,
  aliases: aliasesRouter,
  categories: categoriesRouter,
  contacts: contactsRouter,
  files: filesRouter,
  imports: importsRouter,
  products: productsRouter,
  projects: projectsRouter,
  rules: rulesRouter,
  transactions: transactionsRouter,
});
