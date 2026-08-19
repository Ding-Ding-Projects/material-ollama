import clsx from "clsx"
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import { OVERLAY_RADIUS } from "./tokens"

const DEFAULT_DURATION_MS = 4000

interface SnackbarContextValue {
  show: (text: string, durationMs?: number) => void
}

const SnackbarContext = createContext<SnackbarContextValue | null>(null)

/** `useSnackbar().show(text)` — every notify() call in the design routes
 * through a single bottom-center inverse-surface toast. Calls queue rather
 * than stack: only one snackbar is ever visible at a time. */
export function useSnackbar(): SnackbarContextValue {
  const ctx = useContext(SnackbarContext)
  if (!ctx) {
    throw new Error("useSnackbar must be used within a SnackbarProvider")
  }
  return ctx
}

interface QueueItem {
  id: number
  text: string
  durationMs: number
}

export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<QueueItem[]>([])
  const nextId = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback((text: string, durationMs: number = DEFAULT_DURATION_MS) => {
    nextId.current += 1
    setQueue((current) => [...current, { id: nextId.current, text, durationMs }])
  }, [])

  const current = queue[0]

  useEffect(() => {
    if (!current) return
    timerRef.current = setTimeout(() => {
      setQueue((existing) => existing.slice(1))
    }, current.durationMs)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [current])

  const value = useMemo(() => ({ show }), [show])

  return (
    <SnackbarContext.Provider value={value}>
      {children}
      {current ? (
        <div
          role="status"
          aria-live="polite"
          className={clsx(
            "fixed bottom-6 left-1/2 z-[90] max-w-[80vw] -translate-x-1/2 bg-inverse-surface px-5 py-3 text-[13.5px] text-on-inverse-surface",
            OVERLAY_RADIUS.toast,
            "elev-2",
          )}
        >
          {current.text}
        </div>
      ) : null}
    </SnackbarContext.Provider>
  )
}
