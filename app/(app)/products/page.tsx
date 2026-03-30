import { NewProductDialog } from "@/components/invoicing/new-product-dialog"
import { ProductList } from "@/components/invoicing/product-list"
import { getCurrentUser } from "@/lib/auth"
import { getProducts } from "@/models/products"
import { Plus } from "lucide-react"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Products & Services",
  description: "Manage your products and services catalog",
}

export default async function ProductsPage() {
  const user = await getCurrentUser()
  const products = await getProducts(user.id)

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2 mb-8">
        <h2 className="flex flex-row gap-3 md:gap-5">
          <span className="text-3xl font-bold tracking-tight">Products & Services</span>
          <span className="text-3xl tracking-tight opacity-20">{products.length}</span>
        </h2>
        <NewProductDialog>
          <Plus /> <span className="hidden md:block">Add Product</span>
        </NewProductDialog>
      </header>
      <main>
        <ProductList products={products} />
      </main>
    </>
  )
}
