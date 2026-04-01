"use client"

import { createProductAction } from "@/actions/products"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { ProductForm } from "./product-form"

export function NewProductDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createProductAction(null, formData)
      if (result.success) {
        toast.success("Product created")
        setOpen(false)
      } else {
        toast.error(result.error || "Failed to create product")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>{children}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Product / Service</DialogTitle>
        </DialogHeader>
        <ProductForm onSubmit={handleSubmit} isPending={isPending} />
      </DialogContent>
    </Dialog>
  )
}
