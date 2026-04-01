"use client"

import { updateFieldVisibilityAction } from "@/actions/transactions"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Field } from "@/lib/db-types"
import { ColumnsIcon, Loader2 } from "lucide-react"
import { useRouter } from "@/lib/navigation"
import { useState } from "react"
import { useTranslations, useLocale } from "next-intl"
import { getLocalizedValue } from "@/lib/i18n-db"

export function ColumnSelector({ fields, onChange }: { fields: Field[]; onChange?: () => void }) {
  const router = useRouter()
  const t = useTranslations("transactions")
  const locale = useLocale()
  const [isLoading, setIsLoading] = useState(false)

  const handleToggle = async (fieldCode: string, isCurrentlyVisible: boolean) => {
    setIsLoading(true)

    try {
      await updateFieldVisibilityAction(fieldCode, !isCurrentlyVisible)

      // Refresh the page to reflect changes
      if (onChange) {
        onChange()
      } else {
        router.refresh()
      }
    } catch (error) {
      console.error("Failed to toggle column visibility:", error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" title={t("selectColumns")}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ColumnsIcon className="h-4 w-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Show Columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {fields.map((field) => (
          <DropdownMenuCheckboxItem
            key={field.code}
            checked={field.isVisibleInList}
            onCheckedChange={() => handleToggle(field.code, field.isVisibleInList)}
            disabled={isLoading}
          >
            {getLocalizedValue(field.name, locale)}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
