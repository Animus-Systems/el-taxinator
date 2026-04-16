import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { useNavigate } from "@tanstack/react-router"
import { trpc } from "~/trpc"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, Sparkles, MessageSquarePlus, FileText, RotateCcw, Trash2, PanelBottomClose } from "lucide-react"
import { useWizardDock } from "@/lib/wizard-dock-context"

export function WizardEntry() {
  const { t } = useTranslation("wizard")
  const confirm = useConfirm()
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const dock = useWizardDock()

  const [sessionTab, setSessionTab] = useState<"pending" | "archived">("pending")

  const { data: resumable = [], isLoading: resumableLoading } =
    trpc.wizard.listResumable.useQuery(undefined, { enabled: sessionTab === "pending" })
  const { data: archived = [], isLoading: archivedLoading } =
    trpc.wizard.listArchived.useQuery(undefined, { enabled: sessionTab === "archived" })

  const listForTab = sessionTab === "pending" ? resumable : archived
  const listLoading = sessionTab === "pending" ? resumableLoading : archivedLoading

  const startManual = trpc.wizard.startManual.useMutation({
    onSuccess: ({ sessionId }) => {
      utils.wizard.listResumable.invalidate()
      navigate({ to: `/wizard/${sessionId}` as string })
    },
  })

  const reopenMutation = trpc.wizard.reopenSession.useMutation({
    onSuccess: ({}, vars) => {
      utils.wizard.listResumable.invalidate()
      utils.wizard.listArchived.invalidate()
      navigate({ to: `/wizard/${vars.sessionId}` as string })
    },
  })

  const deleteMutation = trpc.wizard.deleteSession.useMutation({
    onSuccess: () => {
      utils.wizard.listResumable.invalidate()
      utils.wizard.listArchived.invalidate()
    },
  })

  const [dragActive, setDragActive] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  async function handleFile(file: File) {
    setUploadError(null)
    const name = file.name.toLowerCase()
    if (!name.endsWith(".csv") && !name.endsWith(".pdf")) {
      setUploadError("Only CSV and PDF files are supported.")
      return
    }
    setUploading(true)
    try {
      const form = new FormData()
      form.append("file", file)
      const endpoint = name.endsWith(".pdf")
        ? "/api/import/pdf/extract"
        : "/api/import/csv"
      const resp = await fetch(endpoint, { method: "POST", body: form, credentials: "include" })
      if (!resp.ok) {
        const text = await resp.text()
        throw new Error(text || `upload failed (${resp.status})`)
      }
      const json = (await resp.json()) as { sessionId?: string }
      if (!json.sessionId) throw new Error("no session returned from upload")
      utils.wizard.listResumable.invalidate()
      navigate({ to: `/wizard/${json.sessionId}` as string })
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "upload failed")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6">
      <header>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
      </header>

      {/* Sessions list with Pending / Archived tabs */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium">{t("resumeHeader")}</h2>
          <div className="inline-flex items-center rounded-md border bg-muted p-0.5 text-xs gap-0.5">
            {(["pending", "archived"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setSessionTab(tab)}
                className={[
                  "px-2.5 py-1 rounded transition-colors",
                  sessionTab === tab ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {t(tab === "pending" ? "tabPending" : "tabArchived")}
              </button>
            ))}
          </div>
        </div>

        {listLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : listForTab.length === 0 ? (
          <Card>
            <CardContent className="py-4 text-sm text-muted-foreground">
              {sessionTab === "pending" ? t("resumeEmpty") : t("archivedEmpty")}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {listForTab.map((s) => (
              <Card
                key={s.id}
                className={[
                  "transition-colors",
                  sessionTab === "pending" ? "hover:bg-muted/30 cursor-pointer" : "",
                ].join(" ")}
                onClick={sessionTab === "pending" ? () => navigate({ to: `/wizard/${s.id}` as string }) : undefined}
              >
                <CardContent className="py-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">
                      {s.title || s.fileName || `Session ${s.id.slice(0, 8)}`}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="text-[10px]">
                        {t(`entryMode${s.entryMode.charAt(0).toUpperCase()}${s.entryMode.slice(1)}`)}
                      </Badge>
                      <span>
                        {s.candidateCount} {t("candidateCountLabel")}
                      </span>
                      {s.unresolvedCount > 0 ? (
                        <Badge variant="destructive" className="text-[10px]">
                          {s.unresolvedCount} {t("unresolvedCountLabel")}
                        </Badge>
                      ) : null}
                      <span className="ml-auto">
                        {new Date(s.lastActivityAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  {sessionTab === "pending" ? (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          dock.setSession(s.id)
                          navigate({ to: "/transactions" as string })
                        }}
                        title={t("dockAndContinue")}
                      >
                        <PanelBottomClose className="h-3.5 w-3.5 mr-1" />
                        {t("dock")}
                      </Button>
                      <Button variant="ghost" size="sm">
                        {t("resumeOpen")}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          reopenMutation.mutate({ sessionId: s.id })
                        }}
                        disabled={reopenMutation.isPending}
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1" />
                        {t("reopen")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={async (e) => {
                          e.stopPropagation()
                          const ok = await confirm({
                            title: t("confirmDeleteTitle"),
                            description: t("confirmDelete"),
                            confirmLabel: t("delete"),
                            variant: "destructive",
                          })
                          if (ok) deleteMutation.mutate({ sessionId: s.id })
                        }}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        {t("delete")}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-medium mb-2">{t("newEntryHeader")}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Upload */}
          <Card
            className={[
              "cursor-pointer border-2 border-dashed transition-colors",
              dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25",
            ].join(" ")}
            onClick={() => document.getElementById("wizard-file-input")?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragActive(true)
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragActive(false)
              const f = e.dataTransfer.files[0]
              if (f) handleFile(f)
            }}
          >
            <CardContent className="py-10 flex flex-col items-center justify-center gap-2">
              {uploading ? (
                <Loader2 className="h-10 w-10 text-muted-foreground animate-spin" />
              ) : (
                <FileText className="h-10 w-10 text-muted-foreground" />
              )}
              <p className="text-sm font-medium">{t("uploadFile")}</p>
              <p className="text-xs text-muted-foreground">{t("uploadHint")}</p>
              <input
                id="wizard-file-input"
                type="file"
                accept=".csv,.pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFile(f)
                }}
              />
            </CardContent>
          </Card>

          {/* Blank */}
          <Card
            className="cursor-pointer hover:bg-muted/30 transition-colors"
            onClick={() => startManual.mutate({ accountId: null })}
          >
            <CardContent className="py-10 flex flex-col items-center justify-center gap-2">
              {startManual.isPending ? (
                <Loader2 className="h-10 w-10 text-muted-foreground animate-spin" />
              ) : (
                <MessageSquarePlus className="h-10 w-10 text-muted-foreground" />
              )}
              <p className="text-sm font-medium">{t("startBlank")}</p>
              <p className="text-xs text-muted-foreground">Start adding transactions one by one.</p>
            </CardContent>
          </Card>
        </div>
        {uploadError ? <p className="mt-3 text-sm text-destructive">{uploadError}</p> : null}
      </section>
    </div>
  )
}
