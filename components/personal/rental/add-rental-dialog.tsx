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
}

export function AddRentalDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation("tax")
  const utils = trpc.useUtils()
  const [name, setName] = useState("")
  const [address, setAddress] = useState("")
  const [rentalType, setRentalType] = useState<"long" | "short">("long")
  const [ownershipPct, setOwnershipPct] = useState("100")

  const create = trpc.incomeSources.create.useMutation({
    onSuccess: () => {
      utils.incomeSources.list.invalidate()
      utils.incomeSources.totals.invalidate()
      setName("")
      setAddress("")
      setRentalType("long")
      setOwnershipPct("100")
      onOpenChange(false)
    },
  })

  const handleSubmit = () => {
    if (!name.trim()) return
    const pct = Number.parseFloat(ownershipPct)
    create.mutate({
      kind: "rental",
      name: name.trim(),
      metadata: {
        address: address.trim() || undefined,
        rentalType,
        ownershipPct: Number.isFinite(pct) ? pct : 100,
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("personal.rental.addDialogTitle")}</DialogTitle>
          <DialogDescription>{t("personal.rental.addDialogSubtitle")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="flex flex-col gap-1 text-sm">
            <span>{t("personal.rental.propertyName")}</span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Piso Gran Vía"
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>{t("personal.rental.address")}</span>
            <Input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Calle Gran Vía 12, 35002 Las Palmas"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>{t("personal.rental.rentalTypeLabel")}</span>
            <Select value={rentalType} onValueChange={(v) => setRentalType(v as "long" | "short")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="long">{t("personal.rental.type.long")}</SelectItem>
                <SelectItem value="short">{t("personal.rental.type.short")}</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>{t("personal.rental.ownershipPct")}</span>
            <Input
              type="number"
              min={1}
              max={100}
              value={ownershipPct}
              onChange={(event) => setOwnershipPct(event.target.value)}
            />
          </label>
        </div>

        {create.error && <p className="text-sm text-destructive">{create.error.message}</p>}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("personal.cancel")}
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={create.isPending || !name.trim()}>
            {t("personal.rental.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
