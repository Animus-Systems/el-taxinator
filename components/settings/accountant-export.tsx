
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { EntityType } from "@/lib/entities"
import { Download, FileArchive, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"

type Props = {
  entityName: string
  entityType: EntityType
}

export function AccountantExport({ entityName, entityType }: Props) {
  const t = useTranslations("dataExport")
  const tSettings = useTranslations("settings")
  const [isExporting, setIsExporting] = useState<string | null>(null)
  const currentYear = new Date().getFullYear()
  const years = [currentYear - 1, currentYear]

  const handleExport = async (year: number, quarter?: number) => {
    const key = quarter ? `${year}-Q${quarter}` : `${year}`
    setIsExporting(key)
    try {
      const params = new URLSearchParams({ year: String(year) })
      if (quarter) params.set("quarter", String(quarter))

      const response = await fetch(`/api/export/accountant?${params}`)
      if (!response.ok) throw new Error("Export failed")

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = response.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1]
        ?? `accountant-export-${key}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Export failed:", error)
    } finally {
      setIsExporting(null)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileArchive className="h-5 w-5" />
            {entityName}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {entityType === "sl" ? tSettings("sociedadLimitada") : tSettings("autonomo")} — {t("exportIncludes", { models: entityType === "autonomo" ? "420/130" : "420/202" })}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {years.map(year => (
            <div key={year} className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{year}</h3>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => handleExport(year)}
                  disabled={isExporting !== null}
                >
                  {isExporting === `${year}` ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> {t("generating")}</>
                  ) : (
                    <><Download className="h-4 w-4" /> {t("fullYear")}</>
                  )}
                </Button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4].map(q => (
                  <Button
                    key={q}
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => handleExport(year, q)}
                    disabled={isExporting !== null}
                  >
                    {isExporting === `${year}-Q${q}` ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      `Q${q}`
                    )}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground space-y-1 p-4 bg-muted rounded-lg">
        <p className="font-medium">{t("whatsIncluded")}</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>{t("includes1")}</li>
          <li>{t("includes2")}</li>
          <li>{t("includes3")}</li>
          <li>{t("includes4", { models: entityType === "autonomo" ? "420 + 130" : "420 + 202" })}</li>
          <li>{t("includes5")}</li>
          <li>{t("includes6")}</li>
        </ul>
      </div>
    </div>
  )
}
