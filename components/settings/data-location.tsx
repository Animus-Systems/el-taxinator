
import { updateDataLocationAction } from "@/actions/config"
import { listDirectoriesAction } from "@/actions/entities"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { FolderOpen, Loader2, ChevronRight, HardDrive } from "lucide-react"
import { useState, useEffect, useTransition } from "react"
import { useTranslations } from "next-intl"

export function DataLocation({ currentPath }: { currentPath: string }) {
  const t = useTranslations("settings")
  const [browsing, setBrowsing] = useState(false)

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex items-center justify-between gap-4 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <FolderOpen className="h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("dataLocation")}</p>
              <p className="text-xs text-muted-foreground truncate">{currentPath}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setBrowsing(true)}>
            {t("change")}
          </Button>
        </CardContent>
      </Card>

      {browsing && (
        <FolderBrowser
          initialPath={currentPath}
          onSelect={async (selected) => {
            if (!confirm(t("changeDataLocationConfirm"))) return
            try {
              await updateDataLocationAction(selected)
            } catch {
              // Server restarted
            }
            setTimeout(() => window.location.reload(), 3000)
          }}
          onCancel={() => setBrowsing(false)}
        />
      )}
    </div>
  )
}

function FolderBrowser({
  initialPath,
  onSelect,
  onCancel,
}: {
  initialPath: string
  onSelect: (path: string) => void
  onCancel: () => void
}) {
  const t = useTranslations("settings")
  const [isPending, startTransition] = useTransition()
  const [currentDir, setCurrentDir] = useState(initialPath)
  const [directories, setDirectories] = useState<string[]>([])
  const [parentDir, setParentDir] = useState<string | null>(null)
  const [shortcuts, setShortcuts] = useState<{ name: string; path: string }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listDirectoriesAction(currentDir).then((result) => {
      if (cancelled) return
      setCurrentDir(result.current)
      setDirectories(result.directories)
      setParentDir(result.parent)
      setShortcuts(result.shortcuts)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [currentDir])

  const navigate = (dir: string) => {
    setCurrentDir(dir)
  }

  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        {/* Current path */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FolderOpen className="h-4 w-4 shrink-0" />
          <span className="truncate font-mono text-xs">{currentDir}</span>
        </div>

        {/* Shortcuts */}
        {shortcuts.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {shortcuts.map((s) => (
              <Button
                key={s.path}
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => navigate(s.path)}
              >
                <HardDrive className="h-3 w-3 mr-1" />
                {s.name}
              </Button>
            ))}
          </div>
        )}

        {/* Directory list */}
        <div className="border rounded-md max-h-60 overflow-y-auto">
          {parentDir && (
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left border-b"
              onClick={() => navigate(parentDir)}
            >
              <ChevronRight className="h-4 w-4 rotate-180 text-muted-foreground" />
              <span>..</span>
            </button>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : directories.length === 0 ? (
            <p className="text-xs text-muted-foreground px-3 py-4 text-center">
              {t("noFolders")}
            </p>
          ) : (
            directories.map((dir) => (
              <button
                key={dir}
                type="button"
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left"
                onClick={() => navigate(currentDir + "/" + dir)}
              >
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{dir}</span>
                <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />
              </button>
            ))
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {t("cancel")}
          </Button>
          <Button
            size="sm"
            disabled={isPending}
            onClick={() => {
              startTransition(() => {
                onSelect(currentDir)
              })
            }}
          >
            {isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {t("selectFolder")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
