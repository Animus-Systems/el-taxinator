import { ExportTransactionsDialog } from "@/components/export/transactions"
import { UploadButton } from "@/components/files/upload-button"
import { TransactionSearchAndFilters } from "@/components/transactions/filters"
import { TransactionList } from "@/components/transactions/list"
import { NewTransactionDialog } from "@/components/transactions/new"
import { Pagination } from "@/components/transactions/pagination"
import { Button } from "@/components/ui/button"
import { serverClient } from "@/lib/trpc/server-client"
import { TransactionFilters } from "@/models/transactions"
import { Download, Import, Plus, Upload } from "lucide-react"
import { Link } from "@/lib/navigation"
import { getTranslations, setRequestLocale } from "next-intl/server"
import { Metadata } from "next"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Transactions",
  description: "Manage your transactions",
}

const TRANSACTIONS_PER_PAGE = 500

export default async function TransactionsPage({ searchParams, params }: { searchParams: Promise<TransactionFilters>; params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations("transactions")
  const { page, ...filters } = await searchParams
  const trpc = await serverClient()
  const [{ transactions, total }, categories, projects, fields] = await Promise.all([
    trpc.transactions.list({
      ...filters,
      page: page ? Number(page) : undefined,
      limit: TRANSACTIONS_PER_PAGE,
    }),
    trpc.categories.list({}),
    trpc.projects.list({}),
    trpc.fields.list({}),
  ])

  // Reset page if user clicks a filter and no transactions are found
  if (page && page > 1 && transactions.length === 0) {
    const params = new URLSearchParams(filters as Record<string, string>)
    redirect(`?${params.toString()}`)
  }

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2 mb-8">
        <h2 className="flex flex-row gap-3 md:gap-5">
          <span className="text-3xl font-bold tracking-tight">{t("title")}</span>
          <span className="text-3xl tracking-tight opacity-20">{total}</span>
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/import/csv">
              <Import /> <span className="hidden md:block">{t("importCsv")}</span>
            </Link>
          </Button>
          <ExportTransactionsDialog fields={fields} categories={categories} projects={projects} total={total}>
            <Button variant="outline">
              <Download /> <span className="hidden md:block">{t("export")}</span>
            </Button>
          </ExportTransactionsDialog>
          <NewTransactionDialog>
            <Button>
              <Plus /> <span className="hidden md:block">{t("addTransaction")}</span>
            </Button>
          </NewTransactionDialog>
        </div>
      </header>

      <TransactionSearchAndFilters categories={categories} projects={projects} fields={fields} />

      <main>
        <TransactionList transactions={transactions} fields={fields} />

        {total > TRANSACTIONS_PER_PAGE && <Pagination totalItems={total} itemsPerPage={TRANSACTIONS_PER_PAGE} />}

        {transactions.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 h-full min-h-[400px]">
            <p className="text-muted-foreground">
              {t("noTransactions")}
            </p>
            <div className="flex flex-row gap-5 mt-8">
              <UploadButton>
                <Upload /> {t("analyzeNewInvoice")}
              </UploadButton>
              <NewTransactionDialog>
                <Button variant="outline">
                  <Plus />
                  {t("addManually")}
                </Button>
              </NewTransactionDialog>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
