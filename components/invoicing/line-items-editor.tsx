"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatCurrency } from "@/lib/utils"
import { Product } from "@/prisma/client"
import { Plus, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"

export type LineItem = {
  productId?: string | null
  description: string
  quantity: number
  unitPrice: number
  vatRate: number
  position: number
}

type Props = {
  products: Product[]
  initialItems?: LineItem[]
  onChange?: (items: LineItem[]) => void
  currency?: string
}

const DEFAULT_VAT = 21

export function LineItemsEditor({ products, initialItems, onChange, currency = "EUR" }: Props) {
  const [items, setItems] = useState<LineItem[]>(
    initialItems?.length
      ? initialItems
      : [{ productId: null, description: "", quantity: 1, unitPrice: 0, vatRate: DEFAULT_VAT, position: 0 }]
  )

  useEffect(() => {
    onChange?.(items)
  }, [items, onChange])

  function addItem() {
    setItems((prev) => [
      ...prev,
      { productId: null, description: "", quantity: 1, unitPrice: 0, vatRate: DEFAULT_VAT, position: prev.length },
    ])
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx).map((item, i) => ({ ...item, position: i })))
  }

  function updateItem(idx: number, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)))
  }

  function handleProductSelect(idx: number, productId: string) {
    if (productId === "__none__") {
      updateItem(idx, { productId: null })
      return
    }
    const product = products.find((p) => p.id === productId)
    if (product) {
      updateItem(idx, {
        productId: product.id,
        description: product.name,
        unitPrice: product.price,
        vatRate: product.vatRate,
      })
    }
  }

  const subtotal = items.reduce((s, item) => s + item.quantity * item.unitPrice, 0)
  const vatTotal = items.reduce((s, item) => s + item.quantity * item.unitPrice * (item.vatRate / 100), 0)
  const total = subtotal + vatTotal

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 text-sm font-medium text-muted-foreground">
        <span>Description</span>
        <span>Qty</span>
        <span>Unit Price (€)</span>
        <span>VAT %</span>
        <span />
      </div>

      {items.map((item, idx) => (
        <div key={idx} className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 items-center">
          <div className="space-y-1">
            {products.length > 0 && (
              <Select onValueChange={(v) => handleProductSelect(idx, v)} value={item.productId || "__none__"}>
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue placeholder="Select product..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Custom</SelectItem>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Input
              value={item.description}
              onChange={(e) => updateItem(idx, { description: e.target.value })}
              placeholder="Description"
              className="h-8"
            />
          </div>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={item.quantity}
            onChange={(e) => updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })}
            className="h-8"
          />
          <Input
            type="number"
            min="0"
            step="0.01"
            value={(item.unitPrice / 100).toFixed(2)}
            onChange={(e) => updateItem(idx, { unitPrice: Math.round(parseFloat(e.target.value || "0") * 100) })}
            className="h-8"
          />
          <Input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={item.vatRate}
            onChange={(e) => updateItem(idx, { vatRate: parseFloat(e.target.value) || 0 })}
            className="h-8"
          />
          <Button variant="ghost" size="icon" type="button" onClick={() => removeItem(idx)} disabled={items.length === 1}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" onClick={addItem}>
        <Plus className="h-4 w-4 mr-1" /> Add Line
      </Button>

      <div className="border-t pt-3 space-y-1 text-sm text-right">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span>{formatCurrency(subtotal, currency)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">VAT</span>
          <span>{formatCurrency(vatTotal, currency)}</span>
        </div>
        <div className="flex justify-between font-semibold text-base">
          <span>Total</span>
          <span>{formatCurrency(total, currency)}</span>
        </div>
      </div>
    </div>
  )
}
