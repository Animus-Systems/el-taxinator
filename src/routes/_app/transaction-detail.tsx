import { useParams } from "@tanstack/react-router"
import { trpc } from "~/trpc"
import TransactionEditForm from "@/components/transactions/edit"
import {
  CryptoMetaSection,
  shouldShowCryptoMeta,
} from "@/components/transactions/crypto-meta-section"
import { TransactionAllocationsPanel } from "@/components/transactions/allocations-panel"

export function TransactionDetailPage() {
  const { transactionId } = useParams({ strict: false }) as { transactionId: string }

  const { data: transaction, isLoading } = trpc.transactions.getById.useQuery(
    { id: transactionId },
    { enabled: !!transactionId },
  )
  const { data: categories } = trpc.categories.list.useQuery({})
  const { data: projects } = trpc.projects.list.useQuery({})
  const { data: currencies } = trpc.currencies.list.useQuery({})
  const { data: fields } = trpc.fields.list.useQuery({})
  const { data: settings } = trpc.settings.get.useQuery({})

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!transaction) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Transaction not found</div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl space-y-4">
      {shouldShowCryptoMeta(transaction) ? (
        <CryptoMetaSection transaction={transaction} />
      ) : null}
      <TransactionEditForm
        transaction={transaction}
        categories={categories ?? []}
        projects={projects ?? []}
        currencies={currencies ?? []}
        fields={fields ?? []}
        settings={settings ?? {}}
      />
      <TransactionAllocationsPanel transactionId={transaction.id} />
    </div>
  )
}
