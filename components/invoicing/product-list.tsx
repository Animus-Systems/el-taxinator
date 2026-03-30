"use client"

import { deleteProductAction } from "@/app/(app)/products/actions"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatCurrency } from "@/lib/utils"
import { Product } from "@/prisma/client"
import { Pencil, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { EditProductDialog } from "./edit-product-dialog"

export function ProductList({ products }: { products: Product[] }) {
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)

  async function handleDelete(productId: string) {
    if (!confirm("Delete this product?")) return
    const result = await deleteProductAction(null, productId)
    if (result.success) {
      toast.success("Product deleted")
    } else {
      toast.error(result.error || "Failed to delete product")
    }
  }

  if (products.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[300px] text-muted-foreground">
        No products yet. Add products or services to use in your invoices.
      </div>
    )
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>VAT %</TableHead>
            <TableHead>Unit</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product) => (
            <TableRow key={product.id}>
              <TableCell className="font-medium">{product.name}</TableCell>
              <TableCell className="text-muted-foreground">{product.description || "—"}</TableCell>
              <TableCell>{formatCurrency(product.price, product.currencyCode)}</TableCell>
              <TableCell>{product.vatRate}%</TableCell>
              <TableCell>{product.unit || "—"}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="icon" onClick={() => setEditingProduct(product)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(product.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {editingProduct && (
        <EditProductDialog product={editingProduct} onClose={() => setEditingProduct(null)} />
      )}
    </>
  )
}
