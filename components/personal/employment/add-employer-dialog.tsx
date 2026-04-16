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
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Briefcase, Copy, Pencil } from "lucide-react"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Mode = "choose" | "manual"

export function AddEmployerDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation("tax")
  const utils = trpc.useUtils()

  const { data: otherProfiles = [] } = trpc.incomeSources.listFromOtherProfiles.useQuery(
    { kind: "salary" },
    { enabled: open },
  )

  const [mode, setMode] = useState<Mode>("choose")
  const [name, setName] = useState("")
  const [taxId, setTaxId] = useState("")

  const create = trpc.incomeSources.create.useMutation({
    onSuccess: () => {
      utils.incomeSources.list.invalidate()
      utils.incomeSources.totals.invalidate()
      utils.incomeSources.listFromOtherProfiles.invalidate()
      setName("")
      setTaxId("")
      setMode("choose")
      onOpenChange(false)
    },
  })

  const handleSubmit = () => {
    if (!name.trim()) return
    create.mutate({
      kind: "salary",
      name: name.trim(),
      taxId: taxId.trim() || null,
    })
  }

  const handleCopy = (entityId: string, id: string) => {
    const src = otherProfiles.find((p) => p.entityId === entityId && p.id === id)
    if (!src) return
    create.mutate({
      kind: "salary",
      name: src.name,
      taxId: src.taxId,
      metadata: src.metadata,
    })
  }

  const handleDialogChange = (next: boolean) => {
    if (!next) {
      setMode("choose")
      setName("")
      setTaxId("")
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("personal.employment.addDialogTitle")}</DialogTitle>
          <DialogDescription>
            {mode === "manual"
              ? t("personal.employment.addDialogSubtitle")
              : t("personal.employment.addDialogChooseSubtitle")}
          </DialogDescription>
        </DialogHeader>

        {mode === "choose" ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setMode("manual")}
              className="flex w-full items-center gap-3 rounded-md border p-3 text-left hover:bg-muted/60"
            >
              <Pencil className="h-5 w-5 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {t("personal.employment.createManually")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("personal.employment.createManuallyHint")}
                </p>
              </div>
            </button>

            {otherProfiles.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("personal.employment.copyFromProfile")}
                </p>
                <ul className="space-y-2">
                  {otherProfiles.map((src) => (
                    <li key={`${src.entityId}:${src.id}`}>
                      <Card>
                        <CardContent className="flex items-center gap-3 p-3">
                          <Briefcase className="h-5 w-5 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{src.name}</span>
                              {src.taxId && (
                                <Badge variant="outline" className="text-[10px]">
                                  {src.taxId}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {t("personal.employment.fromProfile", { name: src.entityName })}
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleCopy(src.entityId, src.id)}
                            disabled={create.isPending}
                          >
                            <Copy className="mr-1.5 h-3.5 w-3.5" />
                            {t("personal.employment.copy")}
                          </Button>
                        </CardContent>
                      </Card>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <label className="flex flex-col gap-1 text-sm">
              <span>{t("personal.employment.employerName")}</span>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Acme SL"
                autoFocus
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>{t("personal.employment.employerNif")}</span>
              <Input
                value={taxId}
                onChange={(event) => setTaxId(event.target.value)}
                placeholder="B12345678"
              />
            </label>
          </div>
        )}

        {create.error && <p className="text-sm text-destructive">{create.error.message}</p>}

        <DialogFooter>
          {mode === "manual" ? (
            <>
              <Button type="button" variant="ghost" onClick={() => setMode("choose")}>
                {t("personal.back")}
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={create.isPending || !name.trim()}
              >
                {t("personal.employment.save")}
              </Button>
            </>
          ) : (
            <Button type="button" variant="ghost" onClick={() => handleDialogChange(false)}>
              {t("personal.cancel")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
