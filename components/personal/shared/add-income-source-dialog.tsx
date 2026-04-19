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
import type { IncomeSourceKind } from "./income-source-detail-panel"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: Extract<IncomeSourceKind, "dividend" | "interest" | "other">
}

/**
 * Minimal add-source dialog for kinds that don't need AI extraction or copy-
 * from-profile flows (dividends, interest, other). Employment and rental have
 * their own dialogs because they carry kind-specific metadata.
 */
export function AddIncomeSourceDialog({ open, onOpenChange, kind }: Props) {
  const { t } = useTranslation("tax")
  const utils = trpc.useUtils()
  const [name, setName] = useState("")
  const [taxId, setTaxId] = useState("")

  const create = trpc.incomeSources.create.useMutation({
    onSuccess: () => {
      utils.incomeSources.list.invalidate()
      utils.incomeSources.totals.invalidate()
      setName("")
      setTaxId("")
      onOpenChange(false)
    },
  })

  const handleSubmit = () => {
    if (!name.trim()) return
    create.mutate({
      kind,
      name: name.trim(),
      taxId: taxId.trim() || null,
    })
  }

  const titleKey = `personal.${kind}.addDialogTitle`
  const subtitleKey = `personal.${kind}.addDialogSubtitle`
  const nameLabelKey = `personal.${kind}.sourceName`
  const taxIdLabelKey = `personal.${kind}.sourceTaxId`
  const saveKey = `personal.${kind}.save`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(titleKey)}</DialogTitle>
          <DialogDescription>{t(subtitleKey)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="flex flex-col gap-1 text-sm">
            <span>{t(nameLabelKey)}</span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>{t(taxIdLabelKey)}</span>
            <Input
              value={taxId}
              onChange={(event) => setTaxId(event.target.value)}
            />
          </label>
        </div>

        {create.error && <p className="text-sm text-destructive">{create.error.message}</p>}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("personal.cancel")}
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={create.isPending || !name.trim()}>
            {t(saveKey)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
