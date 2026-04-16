import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type SuggestedClient = {
  clientName: string | null
  clientTaxId: string | null
  clientEmail: string | null
  clientPhone: string | null
  clientAddress: string | null
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  suggested: SuggestedClient | null
  onCreated: (clientId: string) => void
}

const emptyFields = { name: "", taxId: "", email: "", phone: "", address: "" }

export function CreateClientFromInvoiceDialog({ open, onOpenChange, suggested, onCreated }: Props) {
  const { t } = useTranslation("invoices")
  const utils = trpc.useUtils()
  const [fields, setFields] = useState(emptyFields)

  useEffect(() => {
    if (!open) return
    setFields({
      name: suggested?.clientName ?? "",
      taxId: suggested?.clientTaxId ?? "",
      email: suggested?.clientEmail ?? "",
      phone: suggested?.clientPhone ?? "",
      address: suggested?.clientAddress ?? "",
    })
  }, [open, suggested])

  const createClient = trpc.clients.create.useMutation({
    onSuccess: (newClient) => {
      if (!newClient) return
      utils.clients.list.invalidate()
      onCreated(newClient.id)
      onOpenChange(false)
    },
  })

  const onSubmit = () => {
    const name = fields.name.trim()
    if (!name) return
    createClient.mutate({
      name,
      ...(fields.email.trim() ? { email: fields.email.trim() } : {}),
      ...(fields.phone.trim() ? { phone: fields.phone.trim() } : {}),
      ...(fields.address.trim() ? { address: fields.address.trim() } : {}),
      ...(fields.taxId.trim() ? { taxId: fields.taxId.trim() } : {}),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("uploadExternal.createClientTitle")}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label htmlFor="new-client-name">{t("uploadExternal.clientNameLabel")}</Label>
            <Input
              id="new-client-name"
              value={fields.name}
              onChange={(e) => setFields((prev) => ({ ...prev, name: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="new-client-taxid">{t("uploadExternal.clientTaxIdLabel")}</Label>
            <Input
              id="new-client-taxid"
              value={fields.taxId}
              onChange={(e) => setFields((prev) => ({ ...prev, taxId: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="new-client-email">{t("uploadExternal.clientEmailLabel")}</Label>
            <Input
              id="new-client-email"
              type="email"
              value={fields.email}
              onChange={(e) => setFields((prev) => ({ ...prev, email: e.target.value }))}
            />
          </div>
          <div className="col-span-2">
            <Label htmlFor="new-client-phone">{t("uploadExternal.clientPhoneLabel")}</Label>
            <Input
              id="new-client-phone"
              value={fields.phone}
              onChange={(e) => setFields((prev) => ({ ...prev, phone: e.target.value }))}
            />
          </div>
          <div className="col-span-2">
            <Label htmlFor="new-client-address">{t("uploadExternal.clientAddressLabel")}</Label>
            <Textarea
              id="new-client-address"
              rows={2}
              value={fields.address}
              onChange={(e) => setFields((prev) => ({ ...prev, address: e.target.value }))}
            />
          </div>
          {createClient.error && (
            <p className="col-span-2 text-xs text-destructive">{createClient.error.message}</p>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={createClient.isPending}
          >
            {t("uploadExternal.cancel")}
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={createClient.isPending || !fields.name.trim()}
          >
            {createClient.isPending
              ? t("uploadExternal.creatingClient")
              : t("uploadExternal.createClientSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
