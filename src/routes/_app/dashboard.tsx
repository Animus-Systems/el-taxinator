/**
 * Dashboard route — SPA equivalent of app/[locale]/(app)/dashboard/page.tsx
 *
 * The original page rendered:
 * 1. DashboardDropZoneWidget (client component — works)
 * 2. DashboardUnsortedWidget (client component — works, needs unsorted files)
 * 3. WelcomeWidget (server component — imports from models, needs SPA rewrite)
 * 4. StatsWidget (server component — imports from models, needs SPA rewrite)
 *
 * For now we render the client components and a placeholder stats section
 * using the stats tRPC endpoint that already exists.
 */
import { trpc } from "~/trpc"
import DashboardDropZoneWidget from "@/components/dashboard/drop-zone-widget"
import DashboardUnsortedWidget from "@/components/dashboard/unsorted-widget"
import { Separator } from "@/components/ui/separator"
import { formatCurrency } from "@/lib/utils"

export function DashboardPage() {
  const { data: unsortedFiles, isLoading: filesLoading } = trpc.files.listUnsorted.useQuery({})
  const { isLoading: settingsLoading } = trpc.settings.get.useQuery({})

  if (filesLoading || settingsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 p-5 w-full max-w-7xl self-center">
      <div className="flex flex-col sm:flex-row gap-5 items-stretch h-full">
        <DashboardDropZoneWidget />
        <DashboardUnsortedWidget files={unsortedFiles ?? []} />
      </div>

      {/* WelcomeWidget was a server component — skipped for Phase 2.
          It will be re-implemented as a client component in a later phase. */}

      <Separator />

      {/* StatsWidget was a server component that called models directly.
          Using the stats tRPC endpoint instead as a simplified placeholder. */}
      <DashboardStats />
    </div>
  )
}

/**
 * Simplified stats display using the stats.dashboard tRPC endpoint.
 * Replaces the server-side StatsWidget for the SPA.
 */
function DashboardStats() {
  const { data: stats, isLoading } = trpc.stats.dashboard.useQuery({})

  if (isLoading) {
    return <div className="text-muted-foreground">Loading stats...</div>
  }

  if (!stats) return null

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-2xl font-bold">Overview</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-gradient-to-br from-white via-green-50/30 to-emerald-50/40 border-green-200/50 p-6">
          <div className="text-sm font-medium text-muted-foreground">Total Income</div>
          <div className="mt-2">
            {Object.entries(stats.totalIncomePerCurrency).map(([currency, total]) => (
              <div key={currency} className="font-bold text-base first:text-2xl text-green-500">
                {formatCurrency(total, currency)}
              </div>
            ))}
            {!Object.keys(stats.totalIncomePerCurrency).length && (
              <div className="text-2xl font-bold">0.00</div>
            )}
          </div>
        </div>

        <div className="rounded-lg border bg-gradient-to-br from-white via-red-50/30 to-rose-50/40 border-red-200/50 p-6">
          <div className="text-sm font-medium text-muted-foreground">Total Expenses</div>
          <div className="mt-2">
            {Object.entries(stats.totalExpensesPerCurrency).map(([currency, total]) => (
              <div key={currency} className="font-bold text-base first:text-2xl text-red-500">
                {formatCurrency(total, currency)}
              </div>
            ))}
            {!Object.keys(stats.totalExpensesPerCurrency).length && (
              <div className="text-2xl font-bold">0.00</div>
            )}
          </div>
        </div>

        <div className="rounded-lg border bg-gradient-to-br from-white via-pink-50/30 to-indigo-50/40 border-pink-200/50 p-6">
          <div className="text-sm font-medium text-muted-foreground">Net Profit</div>
          <div className="mt-2">
            {Object.entries(stats.profitPerCurrency).map(([currency, total]) => (
              <div
                key={currency}
                className={`font-bold text-base first:text-2xl ${total >= 0 ? "text-green-500" : "text-red-500"}`}
              >
                {formatCurrency(total, currency)}
              </div>
            ))}
            {!Object.keys(stats.profitPerCurrency).length && (
              <div className="text-2xl font-bold">0.00</div>
            )}
          </div>
        </div>

        <div className="rounded-lg border bg-gradient-to-br from-white via-blue-50/30 to-indigo-50/40 border-blue-200/50 p-6">
          <div className="text-sm font-medium text-muted-foreground">Processed Transactions</div>
          <div className="mt-2">
            <div className="text-2xl font-bold">{stats.invoicesProcessed}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
