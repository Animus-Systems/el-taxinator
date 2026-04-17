import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2 } from "lucide-react"
import { trpc } from "~/trpc"
import TransactionEditForm from "@/components/transactions/edit"
import {
  CryptoMetaSection,
  shouldShowCryptoMeta,
} from "@/components/transactions/crypto-meta-section"
import { ChatPanel } from "@/components/chat/chat-panel"
import { useTranslations } from "next-intl"

export function EditTransactionDialog({
  transactionId,
  onClose,
}: {
  transactionId: string
  onClose: () => void
}) {
  const t = useTranslations("transactions")
  const utils = trpc.useUtils()

  const { data: transaction, isLoading } = trpc.transactions.getById.useQuery(
    { id: transactionId },
    { enabled: !!transactionId },
  )
  const { data: categories } = trpc.categories.list.useQuery({})
  const { data: projects } = trpc.projects.list.useQuery({})
  const { data: currencies } = trpc.currencies.list.useQuery({})
  const { data: fields } = trpc.fields.list.useQuery({})
  const { data: settings } = trpc.settings.get.useQuery({})

  const handleDone = () => {
    void utils.transactions.list.invalidate()
    onClose()
  }

  return (
    <Dialog defaultOpen onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-6xl h-[85vh] p-0 overflow-hidden grid-rows-1">
        <div className="flex h-full min-h-0">
          <div className="flex-1 overflow-y-auto p-6">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold">{t("title")}</DialogTitle>
              <DialogDescription className="sr-only">
                {t("editDescription")}
              </DialogDescription>
            </DialogHeader>
            {isLoading || !transaction ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4 pt-4">
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
                  onDone={handleDone}
                />
              </div>
            )}
          </div>
          <aside className="w-96 border-l bg-muted/30">
            <ChatPanel contextTransactionId={transactionId} className="h-full" />
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  )
}
