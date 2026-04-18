import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { trpc } from "~/trpc"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2 } from "lucide-react"
import type { EntityType } from "@/lib/entities"

type ModeloSpec = {
  code: string
  label: string
  // Quarterly = needs a quarter value 1-4; annual = quarter is always null.
  quarterly: boolean
}

// Available modelos per entity type. Autónomo skips 202 (corporate payment);
// SL skips 130 (autónomo IRPF). Everyone sees 420 (IGIC), 425 (IGIC annual),
// 100 (IRPF annual), 721 (foreign crypto). The list is small and stable, so
// we hard-code it here rather than share.
const MODELOS_BY_ENTITY: Record<EntityType, ModeloSpec[]> = {
  autonomo: [
    { code: "420", label: "Modelo 420 — IGIC quarterly", quarterly: true },
    { code: "130", label: "Modelo 130 — IRPF autónomo", quarterly: true },
    { code: "425", label: "Modelo 425 — IGIC annual", quarterly: false },
    { code: "100", label: "Modelo 100 — IRPF annual", quarterly: false },
    { code: "721", label: "Modelo 721 — Foreign crypto", quarterly: false },
  ],
  sl: [
    { code: "420", label: "Modelo 420 — IGIC quarterly", quarterly: true },
    { code: "202", label: "Modelo 202 — IS payment", quarterly: true },
    { code: "425", label: "Modelo 425 — IGIC annual", quarterly: false },
    { code: "100", label: "Modelo 100 — IRPF annual", quarterly: false },
    { code: "721", label: "Modelo 721 — Foreign crypto", quarterly: false },
  ],
  individual: [
    { code: "100", label: "Modelo 100 — IRPF annual", quarterly: false },
    { code: "721", label: "Modelo 721 — Foreign crypto", quarterly: false },
  ],
}

function todayYmd(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function parseEuroToCents(input: string): number | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  // Allow user to type "800", "800,00", "800.00", "-50.25", etc.
  const normalized = trimmed.replace(/\s/g, "").replace(",", ".")
  const asFloat = Number.parseFloat(normalized)
  if (!Number.isFinite(asFloat)) return null
  return Math.round(asFloat * 100)
}

export type RecordPastFilingDialogProps = {
  open: boolean
  onOpenChange: (v: boolean) => void
  entityType: EntityType
  defaultYear?: number
  defaultQuarter?: number | null
  defaultModeloCode?: string
  /** When true, the modelo picker is hidden and the form is pinned to
   * `defaultModeloCode` + `defaultQuarter`. Used when opened from a
   * ModeloHero card that already knows what filing the user is recording. */
  lockedToModelo?: boolean
}

export function RecordPastFilingDialog({
  open,
  onOpenChange,
  entityType,
  defaultYear,
  defaultQuarter,
  defaultModeloCode,
  lockedToModelo = false,
}: RecordPastFilingDialogProps) {
  const { t } = useTranslation("tax")
  const utils = trpc.useUtils()

  const modelos = useMemo(
    () => MODELOS_BY_ENTITY[entityType] ?? MODELOS_BY_ENTITY.autonomo,
    [entityType],
  )

  const [modeloCode, setModeloCode] = useState<string>(
    defaultModeloCode ?? modelos[0]?.code ?? "420",
  )
  const [year, setYear] = useState<number>(defaultYear ?? new Date().getFullYear())
  const [quarter, setQuarter] = useState<number | null>(defaultQuarter ?? 1)
  const [filedOn, setFiledOn] = useState<string>(todayYmd())
  const [amountText, setAmountText] = useState<string>("")
  const [nrc, setNrc] = useState<string>("")
  const [notes, setNotes] = useState<string>("")
  const [error, setError] = useState<string | null>(null)

  // Re-sync defaults whenever the dialog is (re)opened with new props.
  useEffect(() => {
    if (!open) return
    setModeloCode(defaultModeloCode ?? modelos[0]?.code ?? "420")
    setYear(defaultYear ?? new Date().getFullYear())
    setQuarter(defaultQuarter ?? 1)
    setFiledOn(todayYmd())
    setAmountText("")
    setNrc("")
    setNotes("")
    setError(null)
  }, [open, defaultModeloCode, defaultYear, defaultQuarter, modelos])

  const selectedSpec = modelos.find((m) => m.code === modeloCode) ?? modelos[0]
  const isQuarterly = selectedSpec?.quarterly ?? false

  const upsert = trpc.taxFilings.upsert.useMutation({
    onSuccess: async (filing) => {
      await utils.taxFilings.list.invalidate({ year: filing.year })
      toast.success(t("recordPastFilingToastSuccess"))
      onOpenChange(false)
    },
    onError: (err) => {
      setError(err.message || t("recordPastFilingToastError"))
    },
  })

  const handleSubmit = () => {
    setError(null)
    const cents = amountText.trim() ? parseEuroToCents(amountText) : null
    if (amountText.trim() && cents === null) {
      setError(t("recordPastFilingAmountInvalid"))
      return
    }
    upsert.mutate({
      year,
      quarter: isQuarterly ? (quarter ?? 1) : null,
      modeloCode,
      filedAt: new Date(filedOn + "T12:00:00"),
      filedAmountCents: cents,
      confirmationNumber: nrc.trim() || null,
      filingSource: "external",
      notes: notes.trim() || null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("recordPastFilingTitle")}</DialogTitle>
          <DialogDescription>{t("recordPastFilingDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!lockedToModelo && (
            <div className="space-y-1.5">
              <Label htmlFor="rpf-modelo">{t("recordPastFilingModeloLabel")}</Label>
              <Select
                value={modeloCode}
                onValueChange={(v) => {
                  setModeloCode(v)
                  const next = modelos.find((m) => m.code === v)
                  if (next && !next.quarterly) setQuarter(null)
                  else if (next && next.quarterly && quarter === null) setQuarter(1)
                }}
              >
                <SelectTrigger id="rpf-modelo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {modelos.map((m) => (
                    <SelectItem key={m.code} value={m.code}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rpf-year">{t("recordPastFilingYearLabel")}</Label>
              <Input
                id="rpf-year"
                type="number"
                min={2000}
                max={2099}
                step={1}
                value={year}
                onChange={(e) => setYear(Number.parseInt(e.target.value, 10) || year)}
              />
            </div>
            {isQuarterly && (
              <div className="space-y-1.5">
                <Label htmlFor="rpf-quarter">{t("recordPastFilingQuarterLabel")}</Label>
                <Select
                  value={String(quarter ?? 1)}
                  onValueChange={(v) => setQuarter(Number.parseInt(v, 10) || 1)}
                >
                  <SelectTrigger id="rpf-quarter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Q1</SelectItem>
                    <SelectItem value="2">Q2</SelectItem>
                    <SelectItem value="3">Q3</SelectItem>
                    <SelectItem value="4">Q4</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rpf-filed-on">{t("recordPastFilingFiledOnLabel")}</Label>
            <Input
              id="rpf-filed-on"
              type="date"
              value={filedOn}
              onChange={(e) => setFiledOn(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rpf-amount">{t("recordPastFilingAmountLabel")}</Label>
            <Input
              id="rpf-amount"
              type="text"
              inputMode="decimal"
              placeholder={t("recordPastFilingAmountPlaceholder")}
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t("recordPastFilingAmountHelp")}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rpf-nrc">{t("recordPastFilingNrcLabel")}</Label>
            <Input
              id="rpf-nrc"
              type="text"
              value={nrc}
              onChange={(e) => setNrc(e.target.value)}
              placeholder={t("recordPastFilingNrcPlaceholder")}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rpf-notes">{t("recordPastFilingNotesLabel")}</Label>
            <Textarea
              id="rpf-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("recordPastFilingNotesPlaceholder")}
            />
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={upsert.isPending}
          >
            {t("recordPastFilingCancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={upsert.isPending}>
            {upsert.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            {t("recordPastFilingSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
