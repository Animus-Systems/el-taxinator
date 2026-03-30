"use client"

import { updateClientAction } from "@/app/(app)/clients/actions"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Client } from "@/prisma/client"
import { useTransition } from "react"
import { toast } from "sonner"
import { ClientForm } from "./client-form"

type Props = {
  client: Client
  onClose: () => void
}

export function EditClientDialog({ client, onClose }: Props) {
  const [isPending, startTransition] = useTransition()

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateClientAction(null, formData)
      if (result.success) {
        toast.success("Client updated")
        onClose()
      } else {
        toast.error(result.error || "Failed to update client")
      }
    })
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Client</DialogTitle>
        </DialogHeader>
        <ClientForm client={client} onSubmit={handleSubmit} isPending={isPending} />
      </DialogContent>
    </Dialog>
  )
}
