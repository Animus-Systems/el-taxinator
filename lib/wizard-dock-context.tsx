import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DockState = {
  sessionId: string | null
  minimized: boolean
}

type DockContextValue = DockState & {
  setSession: (sessionId: string | null) => void
  minimize: () => void
  restore: () => void
  close: () => void
}

const LOCAL_STORAGE_KEY = "taxinator.wizardDock.v1"

const DockContext = createContext<DockContextValue | null>(null)

// ---------------------------------------------------------------------------
// Persistence helpers (localStorage, best-effort)
// ---------------------------------------------------------------------------

function readPersisted(): DockState {
  if (typeof window === "undefined") return { sessionId: null, minimized: false }
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY)
    if (!raw) return { sessionId: null, minimized: false }
    const parsed = JSON.parse(raw) as Partial<DockState>
    return {
      sessionId: typeof parsed.sessionId === "string" ? parsed.sessionId : null,
      minimized: Boolean(parsed.minimized),
    }
  } catch {
    return { sessionId: null, minimized: false }
  }
}

function writePersisted(state: DockState): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // quota exceeded / privacy mode — ignore
  }
}

// ---------------------------------------------------------------------------
// Provider + hook
// ---------------------------------------------------------------------------

export function WizardDockProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DockState>(() => readPersisted())

  // Cross-tab sync: if another tab updates dock state, reflect here.
  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key !== LOCAL_STORAGE_KEY) return
      setState(readPersisted())
    }
    window.addEventListener("storage", handleStorage)
    return () => window.removeEventListener("storage", handleStorage)
  }, [])

  useEffect(() => {
    writePersisted(state)
  }, [state])

  const value: DockContextValue = {
    ...state,
    setSession: (sessionId) => setState({ sessionId, minimized: false }),
    minimize: () => setState((s) => ({ ...s, minimized: true })),
    restore: () => setState((s) => ({ ...s, minimized: false })),
    close: () => setState({ sessionId: null, minimized: false }),
  }

  return <DockContext.Provider value={value}>{children}</DockContext.Provider>
}

export function useWizardDock(): DockContextValue {
  const ctx = useContext(DockContext)
  if (!ctx) {
    // Render safety: treat as no-op when provider is missing so isolated
    // component trees (e.g. tests, storybook) don't explode.
    return {
      sessionId: null,
      minimized: false,
      setSession: () => {},
      minimize: () => {},
      restore: () => {},
      close: () => {},
    }
  }
  return ctx
}
