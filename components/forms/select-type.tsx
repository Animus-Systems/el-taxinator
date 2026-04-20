import { SelectProps } from "@radix-ui/react-select"
import { FormSelect } from "./simple"

export const FormSelectType = ({
  title,
  emptyValue,
  placeholder,
  hideIfEmpty = false,
  isRequired = false,
  ...props
}: {
  title: string
  emptyValue?: string
  placeholder?: string
  hideIfEmpty?: boolean
  isRequired?: boolean
} & SelectProps) => {
  // Mirrors transactionTypeSchema in lib/db-types.ts. Order is user-facing:
  // income/expense first (the common cases), then refund (reversal),
  // transfer/exchange (non-business movement), other (fallback).
  const items = [
    { code: "income", name: "Income", badge: "↑" },
    { code: "expense", name: "Expense", badge: "↓" },
    { code: "refund", name: "Refund", badge: "↺" },
    { code: "transfer", name: "Transfer", badge: "⇄" },
    { code: "exchange", name: "Exchange", badge: "⇆" },
    { code: "other", name: "Other", badge: "?" },
  ]

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
