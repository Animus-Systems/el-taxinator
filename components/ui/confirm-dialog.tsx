import { createContext, useCallback, useContext, useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

/**
 * Replacement for window.confirm that renders a Radix dialog styled to match
 * the rest of the app. Usage:
 *
 *   const confirm = useConfirm()
 *   if (!await confirm({ title: "Delete?", description: "Cannot undo." })) return
 *   doDelete()
 */

export type ConfirmOptions = {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  /** "destructive" styles the confirm button in red for delete-like actions. */
  variant?: "default" | "destructive"
}

type PendingConfirm = ConfirmOptions & {
  resolve: (value: boolean) => void
}

const ConfirmDialogContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(
  null,
)

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  // Hold the resolver in a ref too so the close handler can't accidentally
  // drop one if state transitions race.
  const resolverRef = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
      setPending({ ...options, resolve })
    })
  }, [])

  const settle = useCallback((value: boolean) => {
    const resolve = resolverRef.current
    resolverRef.current = null
    setPending(null)
    if (resolve) resolve(value)
  }, [])

  return (
    <ConfirmDialogContext.Provider value={confirm}>
      {children}
      <Dialog
        open={pending !== null}
        onOpenChange={(next) => {
          if (!next) settle(false)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{pending?.title ?? ""}</DialogTitle>
            {pending?.description && (
              <DialogDescription>{pending.description}</DialogDescription>
            )}
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => settle(false)}>
              {pending?.cancelLabel ?? "Cancel"}
            </Button>
            <Button
              type="button"
              variant={pending?.variant === "destructive" ? "destructive" : "default"}
              onClick={() => settle(true)}
              autoFocus
            >
              {pending?.confirmLabel ?? "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmDialogContext.Provider>
  )
}

export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(ConfirmDialogContext)
  if (!ctx) {
    throw new Error("useConfirm must be used inside <ConfirmDialogProvider>")
  }
  return ctx
}
