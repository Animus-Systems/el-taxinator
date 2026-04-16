import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Sparkles, Upload } from "lucide-react"
import { CreateClientFromInvoiceDialog } from "./create-client-from-invoice-dialog"

type Suggested = {
  number: string | null
  issueDate: string | null
  dueDate: string | null
  clientName: string | null
  clientTaxId: string | null
  clientAddress: string | null
  clientEmail: string | null
  clientPhone: string | null
  total: number | null
  vatRate: number | null
  notes: string | null
  confidence: number
}

type ExtractResponse =
  | { success: true; fileId: string; fileName: string; suggested: Suggested }
  | { success: false; error: string }

type SaveResponse =
  | { success: true; invoice: { id: string; number: string } }
  | { success: false; error: string }

type Client = { id: string; name: string; taxId: string | null }

type Phase = "pick" | "analyzing" | "review"

const todayIso = () => new Date().toISOString().slice(0, 10)

function matchClient(clients: Client[], suggested: Suggested): string | null {
  if (suggested.clientTaxId) {
    const byTax = clients.find(
      (c) => c.taxId?.toLowerCase() === suggested.clientTaxId!.toLowerCase(),
    )
    if (byTax) return byTax.id
  }
  if (suggested.clientName) {
    const byName = clients.find(
      (c) => c.name.toLowerCase() === suggested.clientName!.toLowerCase(),
    )
    if (byName) return byName.id
  }
  return null
}

export function UploadExternalInvoiceDialog({ triggerLabel }: { triggerLabel: string }) {
  const { t } = useTranslation("invoices")
  const utils = trpc.useUtils()
  const { data: clientsData = [] } = trpc.clients.list.useQuery({})
  const clients: Client[] = clientsData.map((c) => ({
    id: c.id,
    name: c.name,
    taxId: c.taxId ?? null,
  }))

  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>("pick")
  const [error, setError] = useState<string | null>(null)
  const [fileId, setFileId] = useState<string | null>(null)
  const [suggested, setSuggested] = useState<Suggested | null>(null)
  const [suggestedClientName, setSuggestedClientName] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [createdClientId, setCreatedClientId] = useState<string | null>(null)
  const [selectedClientId, setSelectedClientId] = useState<string>("")
  const [createClientOpen, setCreateClientOpen] = useState(false)

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const reset = () => {
    setPhase("pick")
    setError(null)
    setFileId(null)
    setSuggested(null)
    setSuggestedClientName(null)
    setIsSaving(false)
    setCreatedClientId(null)
    setSelectedClientId("")
    setCreateClientOpen(false)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) reset()
  }

  const onFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setPhase("analyzing")

    const body = new FormData()
    body.append("file", file)

    try {
      const res = await fetch("/api/invoices/extract", { method: "POST", body })
      const data = (await res.json()) as ExtractResponse
      if (!res.ok || !data.success) {
        setError(data.success === false ? data.error : `Extract failed (${res.status})`)
        setPhase("pick")
        return
      }
      setFileId(data.fileId)
      setSuggested(data.suggested)
      setSuggestedClientName(data.suggested.clientName)
      setSelectedClientId(matchClient(clients, data.suggested) ?? "")
      setPhase("review")
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase("pick")
    }
  }

  const onSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!fileId) return
    setError(null)
    setIsSaving(true)
    const form = new FormData(e.currentTarget)
    form.append("fileId", fileId)

    try {
      const res = await fetch("/api/invoices/upload-external", { method: "POST", body: form })
      const data = (await res.json()) as SaveResponse
      if (!res.ok || !data.success) {
        setError(data.success === false ? data.error : `Save failed (${res.status})`)
        return
      }
      await utils.invoices.list.invalidate()
      setOpen(false)
      reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSaving(false)
    }
  }

  const matchedId = suggested ? matchClient(clients, suggested) : null
  const unmatchedName =
    !createdClientId && suggested && !matchedId && suggestedClientName
      ? suggestedClientName
      : null

  const onClientCreated = (id: string) => {
    setCreatedClientId(id)
    setSelectedClientId(id)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogTrigger asChild>
          <Button variant="outline">
            <Upload /> <span className="hidden md:block">{triggerLabel}</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("uploadExternal.title")}</DialogTitle>
            <DialogDescription>{t("uploadExternal.description")}</DialogDescription>
          </DialogHeader>

          {phase === "pick" && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="ext-file">{t("uploadExternal.file")}</Label>
                <Input
                  id="ext-file"
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={onFilePicked}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("uploadExternal.pickHelp")}
                </p>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                  {t("uploadExternal.cancel")}
                </Button>
              </DialogFooter>
            </div>
          )}

          {phase === "analyzing" && (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">{t("uploadExternal.analyzing")}</p>
            </div>
          )}

          {phase === "review" && suggested && (
            <form onSubmit={onSave} className="space-y-4">
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                <span>{t("uploadExternal.reviewHint")}</span>
              </div>
              {unmatchedName && (
                <div className="flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
                  <span>{t("uploadExternal.clientNotInList", { name: unmatchedName })}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setCreateClientOpen(true)}
                  >
                    {t("uploadExternal.createClientButton")}
                  </Button>
                </div>
              )}
              {createdClientId && (
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  {t("uploadExternal.clientCreated")}
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="ext-number">{t("uploadExternal.number")}</Label>
                  <Input id="ext-number" name="number" type="text" defaultValue={suggested.number ?? ""} required />
                </div>

                <div>
                  <Label htmlFor="ext-status">{t("uploadExternal.status")}</Label>
                  <select
                    id="ext-status"
                    name="status"
                    defaultValue="sent"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="draft">{t("uploadExternal.statusDraft")}</option>
                    <option value="sent">{t("uploadExternal.statusSent")}</option>
                    <option value="paid">{t("uploadExternal.statusPaid")}</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="ext-issue">{t("uploadExternal.issueDate")}</Label>
                  <Input
                    id="ext-issue"
                    name="issueDate"
                    type="date"
                    defaultValue={suggested.issueDate ?? todayIso()}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="ext-due">{t("uploadExternal.dueDate")}</Label>
                  <Input id="ext-due" name="dueDate" type="date" defaultValue={suggested.dueDate ?? ""} />
                </div>

                <div>
                  <Label htmlFor="ext-total">{t("uploadExternal.total")}</Label>
                  <Input
                    id="ext-total"
                    name="total"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={suggested.total != null ? String(suggested.total) : ""}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="ext-vat">{t("uploadExternal.vatRate")}</Label>
                  <Input
                    id="ext-vat"
                    name="vatRate"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    defaultValue={suggested.vatRate != null ? String(suggested.vatRate) : "0"}
                  />
                </div>

                <div className="col-span-2">
                  <Label htmlFor="ext-client">{t("uploadExternal.client")}</Label>
                  <select
                    id="ext-client"
                    name="clientId"
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">{t("uploadExternal.noClient")}</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2">
                  <Label htmlFor="ext-notes">{t("uploadExternal.notes")}</Label>
                  <Textarea id="ext-notes" name="notes" rows={2} defaultValue={suggested.notes ?? ""} />
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>
                  {t("uploadExternal.cancel")}
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? t("uploadExternal.uploading") : t("uploadExternal.save")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <CreateClientFromInvoiceDialog
        open={createClientOpen}
        onOpenChange={setCreateClientOpen}
        suggested={suggested}
        onCreated={onClientCreated}
      />
    </>
  )
}
