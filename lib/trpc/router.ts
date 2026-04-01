import { router } from "./init"
import { transactionsRouter } from "./routers/transactions"
import { invoicesRouter } from "./routers/invoices"
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
import { timeEntriesRouter } from "./routers/time-entries"
import { taxRouter } from "./routers/tax"
import { statsRouter } from "./routers/stats"
import { accountantsRouter } from "./routers/accountants"
import { progressRouter } from "./routers/progress"

export const appRouter = router({
  transactions: transactionsRouter,
  invoices: invoicesRouter,
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
  timeEntries: timeEntriesRouter,
  tax: taxRouter,
  stats: statsRouter,
  accountants: accountantsRouter,
  progress: progressRouter,
})

export type AppRouter = typeof appRouter
