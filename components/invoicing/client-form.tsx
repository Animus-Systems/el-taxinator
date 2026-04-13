
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Client } from "@/lib/db-types"
import { useTranslations } from "next-intl"

type Props = {
  client?: Client
  onSubmit: (formData: FormData) => void
  isPending: boolean
}

export function ClientForm({ client, onSubmit, isPending }: Props) {
  const t = useTranslations("clients")
  return (
    <form action={onSubmit} className="space-y-4">
      {client && <input type="hidden" name="clientId" value={client.id} />}
      <div className="space-y-1">
        <Label htmlFor="name">{t("name")} *</Label>
        <Input id="name" name="name" defaultValue={client?.name} required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="email">{t("email")}</Label>
        <Input id="email" name="email" type="email" defaultValue={client?.email || ""} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="phone">{t("phone")}</Label>
        <Input id="phone" name="phone" defaultValue={client?.phone || ""} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="taxId">{t("taxIdLabel")}</Label>
        <Input id="taxId" name="taxId" defaultValue={client?.taxId || ""} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="address">{t("address")}</Label>
        <Input id="address" name="address" defaultValue={client?.address || ""} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="notes">{t("notes")}</Label>
        <Input id="notes" name="notes" defaultValue={client?.notes || ""} />
      </div>
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? t("saving") : client ? t("saveChanges") : t("createClient")}
      </Button>
    </form>
  )
}
