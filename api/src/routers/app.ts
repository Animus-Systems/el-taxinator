import { router } from "../trpc.js";
import { accountsRouter } from "./app/accounts.js";
import { aliasesRouter } from "./app/aliases.js";
import { categoriesRouter } from "./app/categories.js";
import { contactsRouter } from "./app/contacts.js";
import { filesRouter } from "./app/files.js";
import { fxRouter } from "./app/fx.js";
import { importsRouter } from "./app/imports.js";
import { invoiceTemplatesRouter } from "./app/invoiceTemplates.js";
import { invoicesRouter } from "./app/invoices.js";
import { productsRouter } from "./app/products.js";
import { projectsRouter } from "./app/projects.js";
import { purchasesRouter } from "./app/purchases.js";
import { quotesRouter } from "./app/quotes.js";
import { rulesRouter } from "./app/rules.js";
import { transactionsRouter } from "./app/transactions.js";

// Phase 5 domain routers — adds invoicing (quotes, invoices, payments,
// templates), purchases (with payment allocations), and the global ECB
// FX rate lookup, on top of the Phase 4 transactional core.
export const appRouter = router({
  accounts: accountsRouter,
  aliases: aliasesRouter,
  categories: categoriesRouter,
  contacts: contactsRouter,
  files: filesRouter,
  fx: fxRouter,
  imports: importsRouter,
  invoiceTemplates: invoiceTemplatesRouter,
  invoices: invoicesRouter,
  products: productsRouter,
  projects: projectsRouter,
  purchases: purchasesRouter,
  quotes: quotesRouter,
  rules: rulesRouter,
  transactions: transactionsRouter,
});
