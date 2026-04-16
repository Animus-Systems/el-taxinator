
import type { Category } from "@/lib/db-types"
import { getLocalizedValue } from "@/lib/i18n-db"
import { SelectProps } from "@radix-ui/react-select"
import { useLocale } from "next-intl"
import { useMemo } from "react"
import { FormSelect } from "./simple"

export const FormSelectCategory = ({
  title,
  categories,
  emptyValue,
  placeholder,
  hideIfEmpty = false,
  isRequired = false,
  ...props
}: {
  title: string
  categories: Category[]
  emptyValue?: string
  placeholder?: string
  hideIfEmpty?: boolean
  isRequired?: boolean
} & SelectProps) => {
  const locale = useLocale()
  const items = useMemo(
    () => categories.map((category) => ({ code: category.code, name: getLocalizedValue(category.name, locale), color: category.color })),
    [categories, locale]
  )
  return (
    <FormSelect
      title={title}
      items={items}
      hideIfEmpty={hideIfEmpty}
      isRequired={isRequired}
      {...(emptyValue !== undefined ? { emptyValue } : {})}
      {...(placeholder !== undefined ? { placeholder } : {})}
      {...props}
    />
  )
}
