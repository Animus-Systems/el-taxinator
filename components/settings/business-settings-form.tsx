"use client"

import { saveProfileAction } from "@/actions/settings"
import { FormError } from "@/components/forms/error"
import { FormAvatar, FormInput, FormTextarea } from "@/components/forms/simple"
import { Button } from "@/components/ui/button"
import type { User } from "@/lib/db-types"
import { useRouter } from "@/lib/navigation"
import { CircleCheckBig } from "lucide-react"
import { useTranslations } from "next-intl"
import { useActionState, useEffect } from "react"

export default function BusinessSettingsForm({ user }: { user: User }) {
  const t = useTranslations("settings")
  const router = useRouter()
  const [saveState, saveAction, pending] = useActionState(saveProfileAction, null)

  useEffect(() => {
    if (saveState?.success) {
      router.refresh()
    }
  }, [router, saveState?.success])

  return (
    <div>
      <form suppressHydrationWarning action={saveAction} className="space-y-4">
        <FormInput
          title={t("businessName")}
          name="businessName"
          placeholder="Acme Inc."
          defaultValue={user.businessName ?? ""}
        />

        <FormTextarea
          title={t("businessAddress")}
          name="businessAddress"
          placeholder="Street, City, State, Zip Code, Country, Tax ID"
          defaultValue={user.businessAddress ?? ""}
        />

        <FormTextarea
          title={t("bankDetails")}
          name="businessBankDetails"
          placeholder="Bank Name, Account Number, BIC, IBAN"
          defaultValue={user.businessBankDetails ?? ""}
        />

        <FormAvatar
          title={t("businessLogo")}
          name="businessLogo"
          className="w-52 h-52"
          defaultValue={user.businessLogo ?? ""}
        />

        <div className="flex flex-row items-center gap-4">
          <Button type="submit" disabled={pending}>
            {pending ? t("saving") : t("save")}
          </Button>
          {saveState?.success && (
            <p className="text-green-500 flex flex-row items-center gap-2">
              <CircleCheckBig />
              {t("saved")}
            </p>
          )}
        </div>

        {saveState?.error && <FormError>{saveState.error}</FormError>}
      </form>
    </div>
  )
}
