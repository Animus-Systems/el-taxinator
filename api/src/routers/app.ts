import { router } from "../trpc.js";
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

// Phase 6 domain routers — adds crypto FIFO matching, tax filings checklist,
// AI-learned business facts, personal IRPF inputs (income sources +
// deductions), curated knowledge packs, and per-user chat history on top
// of the Phase 5 invoicing/purchases core.
export const appRouter = router({
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
