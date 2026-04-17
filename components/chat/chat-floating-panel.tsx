import { useCallback, useEffect, useRef, useState } from "react"
import { ChatPanel } from "@/components/chat/chat-panel"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { GripVertical, X } from "lucide-react"
import { useTranslations } from "next-intl"

type Rect = { x: number; y: number; w: number; h: number }

const STORAGE_KEY = "taxinator:chat-panel-rect"
const MIN_W = 320
const MIN_H = 380
const DEFAULT_W = 420
const DEFAULT_H = 600
const EDGE_MARGIN = 16

function readStoredRect(): Rect | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Rect>
    if (
      typeof parsed.x === "number" &&
      typeof parsed.y === "number" &&
      typeof parsed.w === "number" &&
      typeof parsed.h === "number"
    ) {
      return parsed as Rect
    }
  } catch {
    // ignore malformed
  }
  return null
}

function clampRect(rect: Rect): Rect {
  if (typeof window === "undefined") return rect
  const vw = window.innerWidth
  const vh = window.innerHeight
  const w = Math.min(Math.max(rect.w, MIN_W), vw - EDGE_MARGIN * 2)
  const h = Math.min(Math.max(rect.h, MIN_H), vh - EDGE_MARGIN * 2)
  const x = Math.min(Math.max(rect.x, EDGE_MARGIN), vw - w - EDGE_MARGIN)
  const y = Math.min(Math.max(rect.y, EDGE_MARGIN), vh - h - EDGE_MARGIN)
  return { x, y, w, h }
}

function defaultRect(): Rect {
  if (typeof window === "undefined") return { x: 100, y: 100, w: DEFAULT_W, h: DEFAULT_H }
  const w = DEFAULT_W
  const h = DEFAULT_H
  return clampRect({
    x: window.innerWidth - w - EDGE_MARGIN,
    y: window.innerHeight - h - EDGE_MARGIN - 64,
    w,
    h,
  })
}

type ChatFloatingPanelProps = {
  onClose: () => void
}

export function ChatFloatingPanel({ onClose }: ChatFloatingPanelProps) {
  const t = useTranslations("chat")
  const [rect, setRect] = useState<Rect>(() => {
    const stored = readStoredRect()
    return clampRect(stored ?? defaultRect())
  })
  const dragStateRef = useRef<
    | { kind: "drag"; pointerId: number; originX: number; originY: number; startX: number; startY: number }
    | { kind: "resize"; pointerId: number; originX: number; originY: number; startW: number; startH: number }
    | null
  >(null)
  const [mode, setMode] = useState<"idle" | "drag" | "resize">("idle")

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rect))
    } catch {
      // quota / private mode: non-fatal
    }
  }, [rect])

  useEffect(() => {
    const onResize = () => setRect((r) => clampRect(r))
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  const onPointerMove = useCallback((e: PointerEvent) => {
    const s = dragStateRef.current
    if (!s || e.pointerId !== s.pointerId) return
    const dx = e.clientX - s.originX
    const dy = e.clientY - s.originY
    if (s.kind === "drag") {
      setRect((r) => clampRect({ ...r, x: s.startX + dx, y: s.startY + dy }))
    } else {
      setRect((r) => clampRect({ ...r, w: s.startW + dx, h: s.startH + dy }))
    }
  }, [])

  const onPointerUp = useCallback((e: PointerEvent) => {
    const s = dragStateRef.current
    if (!s || e.pointerId !== s.pointerId) return
    dragStateRef.current = null
    setMode("idle")
    window.removeEventListener("pointermove", onPointerMove)
    window.removeEventListener("pointerup", onPointerUp)
    window.removeEventListener("pointercancel", onPointerUp)
  }, [onPointerMove])

  const startDrag = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    dragStateRef.current = {
      kind: "drag",
      pointerId: e.pointerId,
      originX: e.clientX,
      originY: e.clientY,
      startX: rect.x,
      startY: rect.y,
    }
    setMode("drag")
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp)
    window.addEventListener("pointercancel", onPointerUp)
  }

  const startResize = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    dragStateRef.current = {
      kind: "resize",
      pointerId: e.pointerId,
      originX: e.clientX,
      originY: e.clientY,
      startW: rect.w,
      startH: rect.h,
    }
    setMode("resize")
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp)
    window.addEventListener("pointercancel", onPointerUp)
  }

  return (
    <div
      role="dialog"
      aria-label={t("title")}
      className={cn(
        "fixed z-50 flex flex-col overflow-hidden rounded-lg border bg-background shadow-xl",
        mode !== "idle" && "select-none",
      )}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    >
      <div
        onPointerDown={startDrag}
        className={cn(
          "flex items-center gap-2 border-b bg-muted/40 px-3 py-2",
          mode === "drag" ? "cursor-grabbing" : "cursor-grab",
        )}
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm font-medium">{t("title")}</span>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-7 w-7"
          onClick={onClose}
          aria-label={t("close") || "Close"}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <ChatPanel className="h-full" />
      </div>
      <div
        onPointerDown={startResize}
        className={cn(
          "absolute bottom-0 right-0 h-4 w-4",
          mode === "resize" ? "cursor-nwse-resize" : "cursor-nwse-resize",
        )}
        style={{
          background:
            "linear-gradient(135deg, transparent 0%, transparent 50%, var(--border) 50%, var(--border) 60%, transparent 60%, transparent 70%, var(--border) 70%, var(--border) 80%, transparent 80%)",
        }}
        aria-hidden
      />
    </div>
  )
}
