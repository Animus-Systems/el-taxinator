import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { Contact } from "@/lib/db-types"
import { useTranslations } from "next-intl"

type Props = {
  contact?: Contact
  onSubmit: (formData: FormData) => void
  isPending: boolean
}

export function ContactForm({ contact, onSubmit, isPending }: Props) {
  const t = useTranslations("contacts")
  return (
    <form action={onSubmit} className="space-y-4">
      {contact && <input type="hidden" name="contactId" value={contact.id} />}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="name">{t("name")} *</Label>
          <Input id="name" name="name" defaultValue={contact?.name} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="taxId">{t("taxIdLabel")}</Label>
          <Input id="taxId" name="taxId" defaultValue={contact?.taxId || ""} />
        </div>

        <div className="space-y-1">
          <Label htmlFor="role">{t("role")}</Label>
          <select
            id="role"
            name="role"
            defaultValue={contact?.role ?? "client"}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="client">{t("roleClient")}</option>
            <option value="supplier">{t("roleSupplier")}</option>
            <option value="both">{t("roleBoth")}</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="kind">{t("kind")}</Label>
          <select
            id="kind"
            name="kind"
            defaultValue={contact?.kind ?? "company"}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="company">{t("kindCompany")}</option>
            <option value="person">{t("kindPerson")}</option>
          </select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="email">{t("email")}</Label>
          <Input id="email" name="email" type="email" defaultValue={contact?.email || ""} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="phone">{t("phone")}</Label>
          <Input id="phone" name="phone" defaultValue={contact?.phone || ""} />
        </div>

        <div className="space-y-1 col-span-2">
          <Label htmlFor="mobile">{t("mobile")}</Label>
          <Input id="mobile" name="mobile" defaultValue={contact?.mobile || ""} />
        </div>

        <div className="space-y-1 col-span-2">
          <Label htmlFor="address">{t("address")}</Label>
          <Input id="address" name="address" defaultValue={contact?.address || ""} placeholder={t("addressPlaceholder")} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="postalCode">{t("postalCode")}</Label>
          <Input id="postalCode" name="postalCode" defaultValue={contact?.postalCode || ""} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="city">{t("city")}</Label>
          <Input id="city" name="city" defaultValue={contact?.city || ""} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="province">{t("province")}</Label>
          <Input id="province" name="province" defaultValue={contact?.province || ""} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="country">{t("country")}</Label>
          <Input id="country" name="country" defaultValue={contact?.country || ""} />
        </div>

        <div className="space-y-1 col-span-2">
          <Label htmlFor="bankDetails">{t("bankDetails")}</Label>
          <Textarea
            id="bankDetails"
            name="bankDetails"
            rows={2}
            defaultValue={contact?.bankDetails || ""}
            placeholder={t("bankDetailsPlaceholder")}
          />
        </div>

        <div className="space-y-1 col-span-2">
          <Label htmlFor="notes">{t("notes")}</Label>
          <Textarea
            id="notes"
            name="notes"
            rows={2}
            defaultValue={contact?.notes || ""}
          />
        </div>
      </div>

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? t("saving") : contact ? t("saveChanges") : t("createContact")}
      </Button>
    </form>
  )
}
