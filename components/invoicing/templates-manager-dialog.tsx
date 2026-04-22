import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { trpc } from "~/trpc"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ChevronLeft, Copy, Plus } from "lucide-react"
import { TemplateForm } from "./template-form"

/**
 * Internal view state — the dialog switches between a compact list and a
 * single full-screen form (create or edit). One dialog container, three
 * modes, avoids nested Radix dialog gymnastics.
 */
type View =
  | { kind: "list" }
  | { kind: "create" }
  | { kind: "edit"; templateId: string }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TemplatesManagerDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation("invoices")
  const [view, setView] = useState<View>({ kind: "list" })

  // Always restart on the list when the dialog opens so users don't land
  // mid-edit from a stale previous session.
  useEffect(() => {
    if (open) setView({ kind: "list" })
  }, [open])

  const utils = trpc.useUtils()
  const templatesQuery = trpc.invoiceTemplates.list.useQuery({}, { enabled: open })
  const templates = templatesQuery.data ?? []
  const setDefaultMut = trpc.invoiceTemplates.setDefault.useMutation()
  const duplicateMut = trpc.invoiceTemplates.duplicate.useMutation()

  async function handleSetDefault(id: string) {
    try {
      await setDefaultMut.mutateAsync({ id })
      await utils.invoiceTemplates.list.invalidate()
      toast.success(t("template.defaultSet", { defaultValue: "Default template updated" }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed")
    }
  }

  async function handleDuplicate(id: string) {
    try {
      const copy = await duplicateMut.mutateAsync({ id })
      await utils.invoiceTemplates.list.invalidate()
      toast.success(t("template.duplicated", { defaultValue: "Template duplicated" }))
      // Jump straight into editing the copy so the user can immediately
      // rename it / tweak anything they wanted to try differently.
      setView({ kind: "edit", templateId: copy.id })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed")
    }
  }

  const dialogTitle =
    view.kind === "list"
      ? t("template.listTitle", { defaultValue: "Invoice templates" })
      : view.kind === "create"
        ? t("template.newTitle", { defaultValue: "New invoice template" })
        : (templates.find((tmpl) => tmpl.id === view.templateId)?.name ??
           t("template.editTitle", { defaultValue: "Edit template" }))

  const editingTemplate =
    view.kind === "edit"
      ? templates.find((tmpl) => tmpl.id === view.templateId) ?? null
      : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl w-[95vw] max-h-[95vh] flex flex-col gap-4 overflow-hidden">
        <DialogHeader className="flex-row items-center gap-2 space-y-0">
          {view.kind !== "list" && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setView({ kind: "list" })}
              aria-label={t("template.backToList", { defaultValue: "Back to templates" })}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          <DialogTitle className="truncate">{dialogTitle}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {view.kind === "list" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {templates.length === 0
                    ? t("template.emptyHint", {
                        defaultValue:
                          "No templates yet. Create one to customize your logo, accent color, and header/footer text.",
                      })
                    : `${templates.length} template${templates.length === 1 ? "" : "s"}`}
                </span>
                <Button type="button" size="sm" onClick={() => setView({ kind: "create" })}>
                  <Plus className="h-4 w-4" />
                  {t("template.newCta", { defaultValue: "New template" })}
                </Button>
              </div>
              {templates.length > 0 && (
                <ul className="divide-y rounded-md border text-sm">
                  {templates.map((tmpl) => (
                    <li
                      key={tmpl.id}
                      className="flex items-center justify-between gap-3 px-3 py-2"
                    >
                      <button
                        type="button"
                        className="flex items-center gap-2 min-w-0 flex-1 text-left hover:text-foreground"
                        onClick={() => setView({ kind: "edit", templateId: tmpl.id })}
                      >
                        <span
                          className="inline-block h-3 w-3 rounded-full border shrink-0"
                          style={{ backgroundColor: tmpl.accentColor }}
                          aria-hidden
                        />
                        <span className="truncate font-medium">{tmpl.name}</span>
                        {tmpl.isDefault && (
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">
                            {t("template.defaultFlag", { defaultValue: "default" })}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground truncate shrink-0 ml-2">
                          {tmpl.fontPreset} · {tmpl.logoPosition}
                        </span>
                      </button>
                      <div className="flex gap-1 shrink-0">
                        {!tmpl.isDefault && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSetDefault(tmpl.id)}
                          >
                            {t("template.makeDefault", { defaultValue: "Make default" })}
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDuplicate(tmpl.id)}
                          disabled={duplicateMut.isPending}
                          aria-label={t("template.duplicate", { defaultValue: "Duplicate" })}
                          title={t("template.duplicate", { defaultValue: "Duplicate" })}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setView({ kind: "edit", templateId: tmpl.id })}
                        >
                          {t("template.editCta", { defaultValue: "Edit" })}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {view.kind === "create" && (
            <TemplateForm
              mode={{ kind: "create" }}
              onDone={() => setView({ kind: "list" })}
            />
          )}

          {view.kind === "edit" && editingTemplate && (
            <TemplateForm
              mode={{ kind: "edit", template: editingTemplate }}
              onDone={() => setView({ kind: "list" })}
            />
          )}

          {view.kind === "edit" && !editingTemplate && (
            <p className="text-sm text-muted-foreground">
              {t("template.notFound", { defaultValue: "Template not found." })}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
