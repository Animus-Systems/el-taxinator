import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { useRouter } from "@/lib/navigation"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { PurchaseForm } from "./purchase-form"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NewPurchaseDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation("purchases")
  const router = useRouter()

  const { data: contacts = [] } = trpc.contacts.list.useQuery({}, { enabled: open })
  const { data: products = [] } = trpc.products.list.useQuery({}, { enabled: open })
  const { data: currencies = [] } = trpc.currencies.list.useQuery({}, { enabled: open })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("new")}</DialogTitle>
        </DialogHeader>
        <PurchaseForm
          contacts={contacts}
          products={products}
          currencies={currencies}
          onCreated={(id) => {
            onOpenChange(false)
            router.push(`/purchases/${id}`)
          }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
