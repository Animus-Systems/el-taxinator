import { updateContactAction } from "@/actions/contacts"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Contact } from "@/lib/db-types"
import { useTransition } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { ContactForm } from "./contact-form"

type Props = {
  contact: Contact
  onClose: () => void
}

export function EditContactDialog({ contact, onClose }: Props) {
  const t = useTranslations("contacts")
  const [isPending, startTransition] = useTransition()

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateContactAction(null, formData)
      if (result.success) {
        toast.success(t("contactUpdated"))
        onClose()
      } else {
        toast.error(result.error || t("failedToUpdate"))
      }
    })
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("editContact")}</DialogTitle>
        </DialogHeader>
        <ContactForm contact={contact} onSubmit={handleSubmit} isPending={isPending} />
      </DialogContent>
    </Dialog>
  )
}
