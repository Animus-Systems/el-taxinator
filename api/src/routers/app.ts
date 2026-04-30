import { router } from "../trpc.js";
import { accountantCommentsRouter } from "./app/accountantComments.js";
import { accountsRouter } from "./app/accounts.js";
import { aliasesRouter } from "./app/aliases.js";
import { businessFactsRouter } from "./app/businessFacts.js";
import { categoriesRouter } from "./app/categories.js";
import { chatRouter } from "./app/chat.js";
import { contactsRouter } from "./app/contacts.js";
import { cryptoRouter } from "./app/crypto.js";
import { filesRouter } from "./app/files.js";
import { fxRouter } from "./app/fx.js";
import { importsRouter } from "./app/imports.js";
import { invoiceTemplatesRouter } from "./app/invoiceTemplates.js";
import { invoicesRouter } from "./app/invoices.js";
import { knowledgePacksRouter } from "./app/knowledgePacks.js";
import { personalFinancesRouter } from "./app/personalFinances.js";
import { productsRouter } from "./app/products.js";
import { projectsRouter } from "./app/projects.js";
import { purchasesRouter } from "./app/purchases.js";
import { quotesRouter } from "./app/quotes.js";
import { rulesRouter } from "./app/rules.js";
import { taxFilingsRouter } from "./app/taxFilings.js";
import { transactionsRouter } from "./app/transactions.js";

// Phase 7 domain routers — adds accountantComments on top of Phase 6.
// Accountant role hardening lives in tenantProcedure (mutations require
// meta.accountantWritable for accountant members).
export const appRouter = router({
  accountantComments: accountantCommentsRouter,
  accounts: accountsRouter,
  aliases: aliasesRouter,
  businessFacts: businessFactsRouter,
  categories: categoriesRouter,
  chat: chatRouter,
  contacts: contactsRouter,
  crypto: cryptoRouter,
  files: filesRouter,
  fx: fxRouter,
  imports: importsRouter,
  invoiceTemplates: invoiceTemplatesRouter,
  invoices: invoicesRouter,
  knowledgePacks: knowledgePacksRouter,
  personalFinances: personalFinancesRouter,
  products: productsRouter,
  projects: projectsRouter,
  purchases: purchasesRouter,
  quotes: quotesRouter,
  rules: rulesRouter,
  taxFilings: taxFilingsRouter,
  transactions: transactionsRouter,
});
