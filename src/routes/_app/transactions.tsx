/**
 * Transactions route — SPA equivalent of app/[locale]/(app)/transactions/page.tsx
 *
 * Uses TanStack Router search params with Zod validation.
 * Multiple tRPC queries run in parallel via React Query.
 */
import { useTranslation } from "react-i18next"
import { useRouterState } from "@tanstack/react-router"
import type { ComponentProps } from "react"
import { trpc } from "~/trpc"
import { TransactionSearchAndFilters } from "@/components/transactions/filters"
import { TransactionList } from "@/components/transactions/list"
import { TransactionsToolbar } from "@/components/transactions/toolbar"
import { Pagination } from "@/components/transactions/pagination"

type TransactionListItem = ComponentProps<typeof TransactionList>["transactions"][number]

const TRANSACTIONS_PER_PAGE = 500

export function TransactionsPage() {
  const { t } = useTranslation("transactions")

  // Read search params reactively from TanStack Router (re-renders on URL change)
  const search = useRouterState({ select: (s) => s.location.search }) as Record<string, string>
  const page = search["page"] ? Number(search["page"]) : undefined

  // Build query filters, stripping empty/sentinel values
  const queryFilters: Record<string, string | undefined> = {}
  for (const key of ["search", "categoryCode", "projectCode", "accountId", "dateFrom", "dateTo", "type", "ordering"]) {
    const v = search[key]
    if (v && v !== "-") queryFilters[key] = v
  }

  // All queries run in parallel via React Query
  const { data: txResult, isLoading: txLoading } = trpc.transactions.list.useQuery({
    ...queryFilters,
    page,
    limit: TRANSACTIONS_PER_PAGE,
  })

  const { data: categories } = trpc.categories.list.useQuery({})
  const { data: projects } = trpc.projects.list.useQuery({})
  const { data: fields } = trpc.fields.list.useQuery({})
  const { data: accounts } = trpc.accounts.listActive.useQuery({})

  // Normalize: strip explicit `undefined` on optional relations so the data
  // satisfies `exactOptionalPropertyTypes` on the component prop type.
  const transactions: TransactionListItem[] = (txResult?.transactions ?? []).map(
    (tx) => {
      const { category, project, ...rest } = tx
      const base = rest as TransactionListItem
      return {
        ...base,
        ...(category !== undefined ? { category } : {}),
        ...(project !== undefined ? { project } : {}),
      }
    },
  )
  const total = txResult?.total ?? 0

  if (txLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2 mb-8">
        <h2 className="flex flex-row gap-3 md:gap-5">
          <span className="text-3xl font-bold tracking-tight">{t("title")}</span>
          <span className="text-3xl tracking-tight opacity-20">{total}</span>
        </h2>
        <TransactionsToolbar
          accounts={accounts ?? []}
          categories={categories ?? []}
          projects={projects ?? []}
          fields={fields ?? []}
          total={total}
        />
      </header>

      <TransactionSearchAndFilters
        categories={categories ?? []}
        projects={projects ?? []}
        fields={fields ?? []}
        accounts={accounts ?? []}
      />

      <main>
        <TransactionList transactions={transactions} fields={fields ?? []} />

        {total > TRANSACTIONS_PER_PAGE && (
          <Pagination totalItems={total} itemsPerPage={TRANSACTIONS_PER_PAGE} />
        )}

        {transactions.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 h-full min-h-[400px]">
            <p className="text-muted-foreground">{t("noTransactions")}</p>
          </div>
        )}
      </main>
    </>
  )
}
