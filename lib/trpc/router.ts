import { router } from "./init"
import { transactionsRouter } from "./routers/transactions"
import { invoicesRouter } from "./routers/invoices"
import { invoicePaymentsRouter } from "./routers/invoice-payments"
import { quotesRouter } from "./routers/quotes"
import { clientsRouter } from "./routers/clients"
import { productsRouter } from "./routers/products"
import { categoriesRouter } from "./routers/categories"
import { projectsRouter } from "./routers/projects"
import { currenciesRouter } from "./routers/currencies"
import { fieldsRouter } from "./routers/fields"
import { settingsRouter } from "./routers/settings"
import { usersRouter } from "./routers/users"
import { filesRouter } from "./routers/files"
import { taxRouter } from "./routers/tax"
import { statsRouter } from "./routers/stats"
import { accountantsRouter } from "./routers/accountants"
import { progressRouter } from "./routers/progress"
import { accountsRouter } from "./routers/accounts"
import { rulesRouter } from "./routers/rules"
import { entitiesRouter } from "./routers/entities"
import { pastSearchesRouter } from "./routers/past-searches"
import { wizardRouter } from "./routers/wizard"
import { knowledgeRouter } from "./routers/knowledge"
import { cryptoRouter } from "./routers/crypto"

export const appRouter = router({
  transactions: transactionsRouter,
  invoices: invoicesRouter,
  invoicePayments: invoicePaymentsRouter,
  quotes: quotesRouter,
  clients: clientsRouter,
  products: productsRouter,
  categories: categoriesRouter,
  projects: projectsRouter,
  currencies: currenciesRouter,
  fields: fieldsRouter,
  settings: settingsRouter,
  users: usersRouter,
  files: filesRouter,
  tax: taxRouter,
  stats: statsRouter,
  accountants: accountantsRouter,
  progress: progressRouter,
  accounts: accountsRouter,
  rules: rulesRouter,
  entities: entitiesRouter,
  pastSearches: pastSearchesRouter,
  wizard: wizardRouter,
  knowledge: knowledgeRouter,
  crypto: cryptoRouter,
})

export type AppRouter = typeof appRouter
