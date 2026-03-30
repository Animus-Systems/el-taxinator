"use client"

import { createInvoiceAction } from "@/app/(app)/invoices/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Client, Product } from "@/prisma/client"
import { format } from "date-fns"
import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"
import { LineItem, LineItemsEditor } from "./line-items-editor"

type Props = {
  clients: Client[]
  products: Product[]
}

function generateInvoiceNumber() {
  const now = new Date()
  return `F-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-001`
}

export function InvoiceForm({ clients, products }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [items, setItems] = useState<LineItem[]>([])
  const formRef = useRef<HTMLFormElement>(null)
  const today = format(new Date(), "yyyy-MM-dd")

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("items", JSON.stringify(items))

    startTransition(async () => {
      const result = await createInvoiceAction(null, formData)
      if (result.success && result.data) {
        toast.success("Invoice created")
        router.push(`/invoices/${result.data.id}`)
      } else {
        toast.error(result.error || "Failed to create invoice")
      }
    })
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="number">Invoice Number *</Label>
          <Input id="number" name="number" defaultValue={generateInvoiceNumber()} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="clientId">Client</Label>
          <Select name="clientId">
            <SelectTrigger>
              <SelectValue placeholder="Select client..." />
            </SelectTrigger>
            <SelectContent>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <Label htmlFor="issueDate">Issue Date *</Label>
          <Input id="issueDate" name="issueDate" type="date" defaultValue={today} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="dueDate">Due Date</Label>
          <Input id="dueDate" name="dueDate" type="date" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="status">Status</Label>
          <Select name="status" defaultValue="draft">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Line Items *</Label>
        <LineItemsEditor products={products} onChange={setItems} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="irpfRate">Retención IRPF (%)</Label>
          <Select name="irpfRate" defaultValue="0">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">0% — Sin retención</SelectItem>
              <SelectItem value="7">7% — Nuevos autónomos (1er año)</SelectItem>
              <SelectItem value="15">15% — General autónomos</SelectItem>
              <SelectItem value="19">19% — Rendimientos capital</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Retención a cuenta del IRPF aplicada sobre la base imponible</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="notes">Notes</Label>
          <Input id="notes" name="notes" placeholder="Payment terms, bank details, etc." />
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creating..." : "Create Invoice"}
        </Button>
      </div>
    </form>
  )
}
