"use client"

import { saveProfileAction } from "@/actions/settings"
import { FormError } from "@/components/forms/error"
import { FormAvatar, FormInput } from "@/components/forms/simple"
import { Button } from "@/components/ui/button"
import type { User } from "@/lib/db-types"
import { CircleCheckBig } from "lucide-react"
import { useActionState } from "react"
import { useTranslations } from "next-intl"
export default function ProfileSettingsForm({ user }: { user: User }) {
  const [saveState, saveAction, pending] = useActionState(saveProfileAction, null)
  const t = useTranslations("settings")

  return (
    <div>
      <form suppressHydrationWarning action={saveAction} className="space-y-4">
        <FormAvatar
          title={t("avatar")}
          name="avatar"
          className="w-24 h-24"
          defaultValue={user.avatar ? user.avatar + "?" + user.id : ""}
        />

        <FormInput title={t("accountName")} name="name" defaultValue={user.name || ""} />

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
