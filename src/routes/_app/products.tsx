/**
 * Products page — SPA equivalent of app/[locale]/(app)/products/page.tsx
 *
 * Fetches products list via tRPC and renders ProductList + NewProductDialog.
 */
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { NewProductDialog } from "@/components/invoicing/new-product-dialog"
import { ProductList } from "@/components/invoicing/product-list"
import { Plus } from "lucide-react"

export function ProductsPage() {
  const { t } = useTranslation("products")

  const { data: products, isLoading } = trpc.products.list.useQuery({})

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  const productList = products ?? []

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2 mb-8">
        <h2 className="flex flex-row gap-3 md:gap-5">
          <span className="text-3xl font-bold tracking-tight">{t("title")}</span>
          <span className="text-3xl tracking-tight opacity-20">{productList.length}</span>
        </h2>
        <NewProductDialog>
          <Plus /> <span className="hidden md:block">{t("add")}</span>
        </NewProductDialog>
      </header>
      <main>
        <ProductList products={productList} />
      </main>
    </>
  )
}
