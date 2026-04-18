/**
 * InboxFileRow — compact one-line representation of an unreviewed file in the
 * inbox. Collapsed by default; expands inline to show the full AnalyzeForm when
 * the user chooses to analyze/edit. A preview dialog renders the existing
 * `FilePreview` component without cluttering the list.
 */
import { useState, type ComponentProps } from "react"
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import {
  Eye,
  FileText,
  Image as ImageIcon,
  FileSpreadsheet,
  File as FileIcon,
  MoreHorizontal,
  Sparkles,
  Pencil,
  Trash2,
  type LucideIcon,
} from "lucide-react"
import { FilePreview } from "@/components/files/preview"
import AnalyzeForm from "@/components/unsorted/analyze-form"
import { Button } from "@/components/ui/button"
import { useConfirm } from "@/components/ui/confirm-dialog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { formatBytes } from "@/lib/utils"
import type { File as DbFile } from "@/lib/db-types"

type AnalyzeFormProps = ComponentProps<typeof AnalyzeForm>
type AnalyzeFormInvoices = NonNullable<AnalyzeFormProps["invoices"]>

type Props = {
  file: DbFile
  categories: AnalyzeFormProps["categories"]
  projects: AnalyzeFormProps["projects"]
  currencies: AnalyzeFormProps["currencies"]
  fields: AnalyzeFormProps["fields"]
  settings: AnalyzeFormProps["settings"]
  invoices: AnalyzeFormInvoices
}

function iconFor(file: DbFile): LucideIcon {
  const name = file.filename.toLowerCase()
  const mime = file.mimetype.toLowerCase()
  if (name.endsWith(".pdf") || mime === "application/pdf") return FileText
  if (
    mime.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif|heic)$/i.test(name)
  ) {
    return ImageIcon
  }
  if (
    name.endsWith(".csv") ||
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    mime.includes("spreadsheet") ||
    mime === "text/csv"
  ) {
    return FileSpreadsheet
  }
  return FileIcon
}

function readSize(metadata: DbFile["metadata"]): number {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata) && "size" in metadata) {
    const raw = metadata["size"]
    const parsed = typeof raw === "number" ? raw : Number(raw)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function typeChip(mimetype: string, filename: string): string {
  const subtype = mimetype.split("/")[1]
  if (subtype) return subtype.toUpperCase()
  const ext = filename.split(".").pop()
  return (ext ?? "file").toUpperCase()
}

export function InboxFileRow({
  file,
  categories,
  projects,
  currencies,
  fields,
  settings,
  invoices,
}: Props) {
  const { t } = useTranslation("unsorted")
  const confirm = useConfirm()
  const utils = trpc.useUtils()
  const [previewOpen, setPreviewOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  const deleteFile = trpc.files.delete.useMutation({
    onSuccess: () => {
      void utils.files.listUnsorted.invalidate()
      void utils.files.list.invalidate()
    },
  })

  async function onDelete() {
    const ok = await confirm({
      title: t("delete"),
      description: file.filename,
      confirmLabel: t("delete"),
      variant: "destructive",
    })
    if (!ok) return
    deleteFile.mutate({ id: file.id })
  }

  const Icon = iconFor(file)
  const size = readSize(file.metadata)

  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{file.filename}</div>
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span className="uppercase tracking-wide">
              {typeChip(file.mimetype, file.filename)}
            </span>
            {size > 0 && (
              <>
                <span>·</span>
                <span>{formatBytes(size)}</span>
              </>
            )}
            <span>·</span>
            <span>{new Date(file.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setPreviewOpen(true)}
          title={t("preview")}
          aria-label={t("preview")}
        >
          <Eye className="h-4 w-4" />
        </Button>
        <Button size="sm" onClick={() => setEditOpen((v) => !v)}>
          <Sparkles className="mr-1 h-3.5 w-3.5" />
          {t("analyzeWithAi")}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" aria-label="More actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditOpen(true)}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              {t("edit")}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => void onDelete()}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              {t("delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {editOpen && (
        <div className="mt-3 rounded-md border bg-muted/30 p-3">
          <AnalyzeForm
            file={file}
            categories={categories}
            projects={projects}
            currencies={currencies}
            fields={fields}
            settings={settings}
            invoices={invoices}
          />
        </div>
      )}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-auto">
          <DialogHeader>
            <DialogTitle className="truncate">{file.filename}</DialogTitle>
          </DialogHeader>
          <FilePreview file={file} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
