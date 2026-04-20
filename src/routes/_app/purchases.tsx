import { useTranslation } from "react-i18next"
import { useState, type ComponentProps } from "react"
import { trpc } from "~/trpc"
import { PurchaseList } from "@/components/purchases/purchase-list"
import { NewPurchaseDialog } from "@/components/purchases/new-purchase-dialog"
import { ImportPurchasesDialog } from "@/components/purchases/import-purchases-dialog"
import { Button } from "@/components/ui/button"
import { Plus, Sparkles } from "lucide-react"

type PurchaseItem = ComponentProps<typeof PurchaseList>["purchases"][number]

export function PurchasesPage() {
  const { t } = useTranslation("purchases")
  const [newOpen, setNewOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const { data: purchases, isLoading } = trpc.purchases.list.useQuery({})

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  const list: PurchaseItem[] = (purchases ?? []).map((p) => ({
    ...p,
    items: p.items.map((it) => ({ ...it, product: it.product ?? null })),
  })) as PurchaseItem[]

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2 mb-8">
        <h2 className="flex flex-row gap-3 md:gap-5">
          <span className="text-3xl font-bold tracking-tight">{t("title")}</span>
          <span className="text-3xl tracking-tight opacity-20">{list.length}</span>
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Sparkles className="h-4 w-4" />
            <span className="hidden md:block">{t("import.buttonLabel")}</span>
          </Button>
          <Button onClick={() => setNewOpen(true)}>
            <Plus /> <span className="hidden md:block">{t("new")}</span>
          </Button>
        </div>
      </header>
      <main>
        <PurchaseList purchases={list} onCreateNew={() => setNewOpen(true)} />
      </main>
      <NewPurchaseDialog open={newOpen} onOpenChange={setNewOpen} />
      <ImportPurchasesDialog open={importOpen} onOpenChange={setImportOpen} />
    </>
  )
}
