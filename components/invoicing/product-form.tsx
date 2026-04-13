
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Product } from "@/lib/db-types"
import { useTranslations } from "next-intl"

type Props = {
  product?: Product
  onSubmit: (formData: FormData) => void
  isPending: boolean
}

export function ProductForm({ product, onSubmit, isPending }: Props) {
  const t = useTranslations("products")
  return (
    <form action={onSubmit} className="space-y-4">
      {product && <input type="hidden" name="productId" value={product.id} />}
      <div className="space-y-1">
        <Label htmlFor="name">{t("name")} *</Label>
        <Input id="name" name="name" defaultValue={product?.name} required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="description">{t("description")}</Label>
        <Input id="description" name="description" defaultValue={product?.description || ""} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="price">{t("priceEuro")}</Label>
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
          <Label htmlFor="vatRate">{t("vatRate")}</Label>
          <Input
            id="vatRate"
            name="vatRate"
            type="number"
            step="0.01"
            min="0"
            max="100"
            defaultValue={product?.vatRate ?? 7}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="currencyCode">{t("currency")}</Label>
          <Input id="currencyCode" name="currencyCode" defaultValue={product?.currencyCode || "EUR"} maxLength={5} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="unit">{t("unit")}</Label>
          <Input id="unit" name="unit" defaultValue={product?.unit || ""} placeholder={t("unitPlaceholder")} />
        </div>
      </div>
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? t("saving") : product ? t("saveChanges") : t("createProduct")}
      </Button>
    </form>
  )
}
