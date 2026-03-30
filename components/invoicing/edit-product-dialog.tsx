"use client"

import { updateProductAction } from "@/app/(app)/products/actions"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Product } from "@/prisma/client"
import { useTransition } from "react"
import { toast } from "sonner"
import { ProductForm } from "./product-form"

type Props = {
  product: Product
  onClose: () => void
}

export function EditProductDialog({ product, onClose }: Props) {
  const [isPending, startTransition] = useTransition()

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateProductAction(null, formData)
      if (result.success) {
        toast.success("Product updated")
        onClose()
      } else {
        toast.error(result.error || "Failed to update product")
      }
    })
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Product / Service</DialogTitle>
        </DialogHeader>
        <ProductForm product={product} onSubmit={handleSubmit} isPending={isPending} />
      </DialogContent>
    </Dialog>
  )
}
