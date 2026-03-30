"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Product } from "@/prisma/client"

type Props = {
  product?: Product
  onSubmit: (formData: FormData) => void
  isPending: boolean
}

export function ProductForm({ product, onSubmit, isPending }: Props) {
  return (
    <form action={onSubmit} className="space-y-4">
      {product && <input type="hidden" name="productId" value={product.id} />}
      <div className="space-y-1">
        <Label htmlFor="name">Name *</Label>
        <Input id="name" name="name" defaultValue={product?.name} required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="description">Description</Label>
        <Input id="description" name="description" defaultValue={product?.description || ""} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="price">Price (€)</Label>
          <Input
            id="price"
            name="price"
            type="number"
            step="0.01"
            min="0"
            defaultValue={product ? (product.price / 100).toFixed(2) : "0.00"}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="vatRate">VAT Rate (%)</Label>
          <Input
            id="vatRate"
            name="vatRate"
            type="number"
            step="0.01"
            min="0"
            max="100"
            defaultValue={product?.vatRate ?? 21}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="currencyCode">Currency</Label>
          <Input id="currencyCode" name="currencyCode" defaultValue={product?.currencyCode || "EUR"} maxLength={5} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="unit">Unit</Label>
          <Input id="unit" name="unit" defaultValue={product?.unit || ""} placeholder="e.g. hours, pcs" />
        </div>
      </div>
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Saving..." : product ? "Save Changes" : "Create Product"}
      </Button>
    </form>
  )
}
