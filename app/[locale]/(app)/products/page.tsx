import { NewProductDialog } from "@/components/invoicing/new-product-dialog"
import { ProductList } from "@/components/invoicing/product-list"
import { serverClient } from "@/lib/trpc/server-client"
import { Plus } from "lucide-react"
import { getTranslations, setRequestLocale } from "next-intl/server"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Products & Services",
  description: "Manage your products and services catalog",
}

export default async function ProductsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations("products")
  const trpc = await serverClient()
  const products = await trpc.products.list({})

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2 mb-8">
        <h2 className="flex flex-row gap-3 md:gap-5">
          <span className="text-3xl font-bold tracking-tight">{t("title")}</span>
          <span className="text-3xl tracking-tight opacity-20">{products.length}</span>
        </h2>
        <NewProductDialog>
          <Plus /> <span className="hidden md:block">{t("add")}</span>
        </NewProductDialog>
      </header>
      <main>
        <ProductList products={products} />
      </main>
    </>
  )
}
