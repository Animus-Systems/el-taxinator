
import { updateClientAction } from "@/actions/clients"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Client } from "@/lib/db-types"
import { useTransition } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { ClientForm } from "./client-form"

type Props = {
  client: Client
  onClose: () => void
}

export function EditClientDialog({ client, onClose }: Props) {
  const t = useTranslations("clients")
  const [isPending, startTransition] = useTransition()

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateClientAction(null, formData)
      if (result.success) {
        toast.success(t("clientUpdated"))
        onClose()
      } else {
        toast.error(result.error || t("failedToUpdate"))
      }
    })
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("editClient")}</DialogTitle>
        </DialogHeader>
        <ClientForm client={client} onSubmit={handleSubmit} isPending={isPending} />
      </DialogContent>
    </Dialog>
  )
}
