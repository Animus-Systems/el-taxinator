
import type { Project } from "@/lib/db-types"
import { getLocalizedValue } from "@/lib/i18n-db"
import { SelectProps } from "@radix-ui/react-select"
import { useLocale } from "next-intl"
import { FormSelect } from "./simple"

export const FormSelectProject = ({
  title,
  projects,
  emptyValue,
  placeholder,
  hideIfEmpty = false,
  isRequired = false,
  ...props
}: {
  title: string
  projects: Project[]
  emptyValue?: string
  placeholder?: string
  hideIfEmpty?: boolean
  isRequired?: boolean
} & SelectProps) => {
  const locale = useLocale()
  return (
    <FormSelect
      title={title}
      items={projects.map((project) => ({ code: project.code, name: getLocalizedValue(project.name, locale), color: project.color }))}
      emptyValue={emptyValue}
      placeholder={placeholder}
      hideIfEmpty={hideIfEmpty}
      isRequired={isRequired}
      {...props}
    />
  )
}
