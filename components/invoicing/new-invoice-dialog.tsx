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

type InvoiceKind = "invoice" | "simplified"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Which numbering series this new row belongs to. Matters for the dialog
   * title and the `kind` field submitted to the backend. */
  kind?: InvoiceKind
}

export function NewInvoiceDialog({ open, onOpenChange, kind = "invoice" }: Props) {
  const { t } = useTranslation("invoices")
  const router = useRouter()

  const { data: clients = [] } = trpc.contacts.list.useQuery({}, { enabled: open })
  const { data: products = [] } = trpc.products.list.useQuery({}, { enabled: open })

  const title = kind === "simplified" ? t("newSimplifiedInvoice") : t("newInvoice")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <InvoiceForm
          clients={clients}
          products={products}
          kind={kind}
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
