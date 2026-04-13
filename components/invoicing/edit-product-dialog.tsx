
import { updateProductAction } from "@/actions/products"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Product } from "@/lib/db-types"
import { useTransition } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { ProductForm } from "./product-form"

type Props = {
  product: Product
  onClose: () => void
}

export function EditProductDialog({ product, onClose }: Props) {
  const t = useTranslations("products")
  const [isPending, startTransition] = useTransition()

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateProductAction(null, formData)
      if (result.success) {
        toast.success(t("productUpdated"))
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
          <DialogTitle>{t("editProduct")}</DialogTitle>
        </DialogHeader>
        <ProductForm product={product} onSubmit={handleSubmit} isPending={isPending} />
      </DialogContent>
    </Dialog>
  )
}
