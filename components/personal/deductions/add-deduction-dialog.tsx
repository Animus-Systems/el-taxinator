import { useState } from "react"
import { useTranslation } from "react-i18next"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  taxYear: number
}

const KINDS = ["pension", "mortgage", "donation", "family", "regional", "other"] as const
type Kind = typeof KINDS[number]

export function AddDeductionDialog({ open, onOpenChange, taxYear }: Props) {
  const { t } = useTranslation("tax")
  const utils = trpc.useUtils()
  const [kind, setKind] = useState<Kind>("pension")
  const [amount, setAmount] = useState("")
  const [description, setDescription] = useState("")

  const create = trpc.deductions.create.useMutation({
    onSuccess: () => {
      utils.deductions.list.invalidate()
      utils.deductions.totalsForYear.invalidate()
      setAmount("")
      setDescription("")
      onOpenChange(false)
    },
  })

  const handleSubmit = () => {
    const euros = Number.parseFloat(amount)
    if (!Number.isFinite(euros) || euros <= 0) return
    create.mutate({
      kind,
      taxYear,
      amountCents: Math.round(euros * 100),
      description: description.trim() || null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("personal.deductions.addDialogTitle")}</DialogTitle>
          <DialogDescription>{t("personal.deductions.addDialogSubtitle")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="flex flex-col gap-1 text-sm">
            <span>{t("personal.deductions.kindLabel")}</span>
            <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {t(`personal.deductions.kind.${k}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>{t("personal.deductions.amountEuros")}</span>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="1500.00"
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>{t("personal.deductions.descriptionLabel")}</span>
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t("personal.deductions.descriptionPlaceholder")}
            />
          </label>
        </div>

        {create.error && <p className="text-sm text-destructive">{create.error.message}</p>}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("personal.cancel")}
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={create.isPending || !amount}
          >
            {t("personal.deductions.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
