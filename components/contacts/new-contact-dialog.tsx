import { createContactAction } from "@/actions/contacts"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { ContactForm } from "./contact-form"

export function NewContactDialog({ children }: { children: React.ReactNode }) {
  const t = useTranslations("contacts")
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createContactAction(null, formData)
      if (result.success) {
        toast.success(t("createContact"))
        setOpen(false)
      } else {
        toast.error(result.error || t("failedToUpdate"))
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>{children}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("createContact")}</DialogTitle>
        </DialogHeader>
        <ContactForm onSubmit={handleSubmit} isPending={isPending} />
      </DialogContent>
    </Dialog>
  )
}
