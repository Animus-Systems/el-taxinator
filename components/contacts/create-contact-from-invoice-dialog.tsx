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

type SuggestedContact = {
  clientName: string | null
  clientTaxId: string | null
  clientEmail: string | null
  clientPhone: string | null
  clientAddress: string | null
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  suggested: SuggestedContact | null
  onCreated: (contactId: string) => void
}

const emptyFields = { name: "", taxId: "", email: "", phone: "", address: "" }

export function CreateContactFromInvoiceDialog({ open, onOpenChange, suggested, onCreated }: Props) {
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

  const createContact = trpc.contacts.create.useMutation({
    onSuccess: (newContact) => {
      if (!newContact) return
      utils.contacts.list.invalidate()
      onCreated(newContact.id)
      onOpenChange(false)
    },
  })

  const onSubmit = () => {
    const name = fields.name.trim()
    if (!name) return
    createContact.mutate({
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
            <Label htmlFor="new-contact-name">{t("uploadExternal.clientNameLabel")}</Label>
            <Input
              id="new-contact-name"
              value={fields.name}
              onChange={(e) => setFields((prev) => ({ ...prev, name: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="new-contact-taxid">{t("uploadExternal.clientTaxIdLabel")}</Label>
            <Input
              id="new-contact-taxid"
              value={fields.taxId}
              onChange={(e) => setFields((prev) => ({ ...prev, taxId: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="new-contact-email">{t("uploadExternal.clientEmailLabel")}</Label>
            <Input
              id="new-contact-email"
              type="email"
              value={fields.email}
              onChange={(e) => setFields((prev) => ({ ...prev, email: e.target.value }))}
            />
          </div>
          <div className="col-span-2">
            <Label htmlFor="new-contact-phone">{t("uploadExternal.clientPhoneLabel")}</Label>
            <Input
              id="new-contact-phone"
              value={fields.phone}
              onChange={(e) => setFields((prev) => ({ ...prev, phone: e.target.value }))}
            />
          </div>
          <div className="col-span-2">
            <Label htmlFor="new-contact-address">{t("uploadExternal.clientAddressLabel")}</Label>
            <Textarea
              id="new-contact-address"
              rows={2}
              value={fields.address}
              onChange={(e) => setFields((prev) => ({ ...prev, address: e.target.value }))}
            />
          </div>
          {createContact.error && (
            <p className="col-span-2 text-xs text-destructive">{createContact.error.message}</p>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={createContact.isPending}
          >
            {t("uploadExternal.cancel")}
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={createContact.isPending || !fields.name.trim()}
          >
            {createContact.isPending
              ? t("uploadExternal.creatingClient")
              : t("uploadExternal.createClientSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
