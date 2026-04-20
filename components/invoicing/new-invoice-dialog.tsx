import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { useRouter } from "@/lib/navigation"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { InvoiceForm } from "./invoice-form"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NewInvoiceDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation("invoices")
  const router = useRouter()

  const { data: clients = [] } = trpc.contacts.list.useQuery({}, { enabled: open })
  const { data: products = [] } = trpc.products.list.useQuery({}, { enabled: open })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("newInvoice")}</DialogTitle>
        </DialogHeader>
        <InvoiceForm
          clients={clients}
          products={products}
          onCreated={(id) => {
            onOpenChange(false)
            router.push(`/invoices/${id}`)
          }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
