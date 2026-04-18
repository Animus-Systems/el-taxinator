import {
  createRouter,
  createRootRoute,
  createRoute,
  Outlet,
} from "@tanstack/react-router"
import { AppLayout } from "./routes/_app"

// Pages — app layout
import { DashboardPage } from "./routes/_app/dashboard"
import { TransactionsPage } from "./routes/_app/transactions"
import { TransactionDetailPage } from "./routes/_app/transaction-detail"
import { UnsortedPage } from "./routes/_app/unsorted"
import { FilesPage } from "./routes/_app/files"
import { ReportsPage } from "./routes/_app/reports"
import { InvoicesPage } from "./routes/_app/invoices"
import { NewInvoicePage } from "./routes/_app/invoices-new"
import { InvoiceDetailPage } from "./routes/_app/invoice-detail"
import { ReconcilePage } from "./routes/_app/reconcile"
import { ClientsPage } from "./routes/_app/clients"
import { ProductsPage } from "./routes/_app/products"
import { QuotesPage } from "./routes/_app/quotes"
import { NewQuotePage } from "./routes/_app/quotes-new"
import { QuoteDetailPage } from "./routes/_app/quote-detail"
import { TaxPage } from "./routes/_app/tax"
import { TaxYearPage } from "./routes/_app/tax-year"
import { TaxQuarterPage } from "./routes/_app/tax-quarter"
import { AppsPage } from "./routes/_app/apps"
import { WizardNewPage } from "./routes/_app/wizard-new"
import { WizardDetailPage } from "./routes/_app/wizard-detail"
import { WizardCommittedPage } from "./routes/_app/wizard-committed"
import { CryptoPage } from "./routes/_app/crypto"
import { PersonalIndexPage } from "./routes/_app/personal/index"
import { EmploymentPage } from "./routes/_app/personal/employment"
import { RentalPage } from "./routes/_app/personal/rental"
import { DeductionsPage } from "./routes/_app/personal/deductions"

// Pages — settings layout
import { SettingsLayout } from "./routes/_app/settings"
import { SettingsIndexPage } from "./routes/_app/settings/index"
import { CategoriesSettingsPage } from "./routes/_app/settings/categories"
import { RulesSettingsPage } from "./routes/_app/settings/rules"
import { RuleDetailPage } from "./routes/_app/settings/rule-detail"
import { ProjectsSettingsPage } from "./routes/_app/settings/projects"
import { CurrenciesSettingsPage } from "./routes/_app/settings/currencies"
import { FieldsSettingsPage } from "./routes/_app/settings/fields"
import { AccountsSettingsPage } from "./routes/_app/settings/accounts"
import { LlmSettingsPage } from "./routes/_app/settings/llm"
import { BusinessSettingsPage } from "./routes/_app/settings/business"
import { BackupsSettingsPage } from "./routes/_app/settings/backups"
import { AccountantSettingsPage } from "./routes/_app/settings/accountant"
import { EntitiesSettingsPage } from "./routes/_app/settings/entities"
import { DangerSettingsPage } from "./routes/_app/settings/danger"
import { ImportSettingsPage } from "./routes/_app/settings/import"
import { ProfileSettingsPage } from "./routes/_app/settings/profile"
import { KnowledgeSettingsPage } from "./routes/_app/settings/knowledge"
import { AiMemorySettingsPage } from "./routes/_app/settings/ai-memory"

// Pages — outside app layout
import { EntityPickerPage } from "./routes/index"

// ---------------------------------------------------------------------------
// Root route
// ---------------------------------------------------------------------------
const rootRoute = createRootRoute({
  component: () => <Outlet />,
  errorComponent: ({ error }) => (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-red-600 mb-4">Something went wrong</h1>
      <pre className="bg-red-50 p-4 rounded text-sm overflow-auto">{error instanceof Error ? error.message : String(error)}</pre>
      <pre className="bg-red-50 p-4 rounded text-xs mt-2 overflow-auto">{error instanceof Error ? error.stack : ""}</pre>
      <a href="/" className="mt-4 inline-block text-blue-600 underline">Go home</a>
    </div>
  ),
  notFoundComponent: () => (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Page not found</h1>
      <a href="/" className="text-blue-600 underline">Go home</a>
    </div>
  ),
})

// ---------------------------------------------------------------------------
// Entity picker — "/" (no sidebar)
// ---------------------------------------------------------------------------
const entityPickerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: EntityPickerPage,
})

// ---------------------------------------------------------------------------
// Authenticated app layout — sidebar + content area
// ---------------------------------------------------------------------------
const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  component: AppLayout,
})

// ---------------------------------------------------------------------------
// Top-level app pages
// ---------------------------------------------------------------------------
const dashboardRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/dashboard",
  component: DashboardPage,
})

const transactionsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/transactions",
  component: TransactionsPage,
})

const transactionDetailRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/transactions/$transactionId",
  component: TransactionDetailPage,
})

const unsortedRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/unsorted",
  component: UnsortedPage,
})

const filesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/files",
  component: FilesPage,
})

const reportsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/reports",
  component: ReportsPage,
})

const invoicesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/invoices",
  component: InvoicesPage,
})

const invoicesNewRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/invoices/new",
  component: NewInvoicePage,
})

const invoiceDetailRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/invoices/$invoiceId",
  component: InvoiceDetailPage,
})

const reconcileRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/reconcile",
  component: ReconcilePage,
})

const clientsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/clients",
  component: ClientsPage,
})

const productsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/products",
  component: ProductsPage,
})

const quotesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/quotes",
  component: QuotesPage,
})

const quotesNewRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/quotes/new",
  component: NewQuotePage,
})

const quoteDetailRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/quotes/$quoteId",
  component: QuoteDetailPage,
})

const taxRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/tax",
  component: TaxPage,
})

const taxYearRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/tax/$year",
  component: TaxYearPage,
})

const taxQuarterRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/tax/$year/$quarter",
  component: TaxQuarterPage,
})

const appsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/apps",
  component: AppsPage,
})

const wizardNewRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/wizard/new",
  component: WizardNewPage,
})

const wizardDetailRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/wizard/$sessionId",
  component: WizardDetailPage,
})

const wizardCommittedRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/wizard/$sessionId/committed",
  component: WizardCommittedPage,
})

const cryptoRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/crypto",
  component: CryptoPage,
})

const personalIndexRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/personal",
  component: PersonalIndexPage,
})

const personalEmploymentRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/personal/employment",
  component: EmploymentPage,
})

const personalRentalRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/personal/rental",
  component: RentalPage,
})

const personalDeductionsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/personal/deductions",
  component: DeductionsPage,
})

// ---------------------------------------------------------------------------
// Settings layout (has sub-routes)
// ---------------------------------------------------------------------------
const settingsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/settings",
  component: SettingsLayout,
})

const settingsIndexRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/",
  component: SettingsIndexPage,
})

const settingsCategoriesRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/categories",
  component: CategoriesSettingsPage,
})

const settingsRulesRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/rules",
  component: RulesSettingsPage,
})

const settingsRuleDetailRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/rules/$ruleId",
  component: RuleDetailPage,
})

const settingsProjectsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/projects",
  component: ProjectsSettingsPage,
})

const settingsCurrenciesRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/currencies",
  component: CurrenciesSettingsPage,
})

const settingsFieldsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/fields",
  component: FieldsSettingsPage,
})

const settingsAccountsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/accounts",
  component: AccountsSettingsPage,
})

const settingsLlmRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/llm",
  component: LlmSettingsPage,
})

const settingsBusinessRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/business",
  component: BusinessSettingsPage,
})

const settingsBackupsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/backups",
  component: BackupsSettingsPage,
})

const settingsAccountantRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/accountant",
  component: AccountantSettingsPage,
})

const settingsEntitiesRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/entities",
  component: EntitiesSettingsPage,
})

const settingsDangerRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/danger",
  component: DangerSettingsPage,
})

const settingsImportRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/import",
  component: ImportSettingsPage,
})

const settingsProfileRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/profile",
  component: ProfileSettingsPage,
})

const settingsKnowledgeRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/knowledge",
  component: KnowledgeSettingsPage,
})

const settingsAiMemoryRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/ai-memory",
  component: AiMemorySettingsPage,
})

// ---------------------------------------------------------------------------
// Wire the route tree
// ---------------------------------------------------------------------------
const settingsChildren = settingsRoute.addChildren([
  settingsIndexRoute,
  settingsCategoriesRoute,
  settingsRulesRoute,
  settingsRuleDetailRoute,
  settingsProjectsRoute,
  settingsCurrenciesRoute,
  settingsFieldsRoute,
  settingsAccountsRoute,
  settingsLlmRoute,
  settingsBusinessRoute,
  settingsBackupsRoute,
  settingsAccountantRoute,
  settingsEntitiesRoute,
  settingsDangerRoute,
  settingsImportRoute,
  settingsProfileRoute,
  settingsKnowledgeRoute,
  settingsAiMemoryRoute,
])

const appChildren = appLayoutRoute.addChildren([
  dashboardRoute,
  transactionsRoute,
  transactionDetailRoute,
  unsortedRoute,
  filesRoute,
  reportsRoute,
  invoicesRoute,
  invoicesNewRoute,
  invoiceDetailRoute,
  reconcileRoute,
  clientsRoute,
  productsRoute,
  quotesRoute,
  quotesNewRoute,
  quoteDetailRoute,
  taxRoute,
  taxYearRoute,
  taxQuarterRoute,
  appsRoute,
  wizardNewRoute,
  wizardDetailRoute,
  wizardCommittedRoute,
  cryptoRoute,
  personalIndexRoute,
  personalEmploymentRoute,
  personalRentalRoute,
  personalDeductionsRoute,
  settingsChildren,
])

const routeTree = rootRoute.addChildren([entityPickerRoute, appChildren])

export const router = createRouter({ routeTree })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
