import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import type { TaxFiling } from "@/lib/db-types"
import { Check, ExternalLink } from "lucide-react"
import { useTranslations } from "next-intl"
import { trpc } from "~/trpc"

export type ChecklistItem = {
  key: string
  label: string
  href?: string
}

export type FilingChecklistProps = {
  year: number
  quarter: number | null
  modeloCode: string
  filing: TaxFiling | null
  items: ChecklistItem[]
}

export function FilingChecklist({
  year,
  quarter,
  modeloCode,
  filing,
  items,
}: FilingChecklistProps) {
  const t = useTranslations("tax")
  const utils = trpc.useUtils()
  const upsert = trpc.taxFilings.upsert.useMutation({
    onSuccess: async () => {
      await utils.taxFilings.list.invalidate({ year })
    },
  })

  const currentChecklist: Record<string, boolean> = filing?.checklist ?? {}
  const allChecked = items.length > 0 && items.every((item) => currentChecklist[item.key] === true)

  async function toggle(key: string, next: boolean): Promise<void> {
    await upsert.mutateAsync({
      year,
      quarter,
      modeloCode,
      checklist: { ...currentChecklist, [key]: next },
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("checklist.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {allChecked ? (
          <Alert className="border-green-500/40 bg-green-50/50 dark:bg-green-950/20">
            <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
            <AlertDescription className="text-green-700 dark:text-green-400">
              {t("checklist.filingComplete")}
            </AlertDescription>
          </Alert>
        ) : null}
        <ul className="space-y-2">
          {items.map((item) => {
            const checked = currentChecklist[item.key] === true
            return (
              <li key={item.key} className="flex items-center gap-3">
                <label className="flex flex-1 cursor-pointer items-center gap-3 text-sm">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(value) => {
                      void toggle(item.key, value === true)
                    }}
                    disabled={upsert.isPending}
                  />
                  <span className={checked ? "text-muted-foreground line-through" : ""}>
                    {item.label}
                  </span>
                </label>
                {item.href ? (
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                ) : null}
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
