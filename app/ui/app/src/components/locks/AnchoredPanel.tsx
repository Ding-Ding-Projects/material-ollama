import clsx from "clsx"
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { OVERLAY_RADIUS, OVERLAY_SURFACE } from "@/components/md3"

export interface AnchoredPanelProps {
  open: boolean
  onClose: () => void
  /** The element the panel should appear beside -- its bounding rect is
   * measured live, so the panel tracks a moving/scrolling target rather
   * than freezing at the position it happened to open at. */
  anchorEl: HTMLElement | null
  children: ReactNode
  className?: string
  /** Accessible label for the panel's own dialog role. */
  label: string
}

/**
 * The one non-modal anchored overlay primitive every locks/ surface builds
 * on: the wizard, the unlock prompt, and the ladder. Built locally rather
 * than reusing `@/components/md3`'s `Popover`/`Menu` because both of those
 * render their OWN trigger button (`Headless.PopoverButton` /
 * `Headless.MenuButton`) — there is no way to hand them a trigger that
 * already exists elsewhere (a context-menu click, a locked placeholder's
 * own click) and have them open beside it. `ContextMenu` in the same
 * folder solves exactly this positioning problem already (viewport-clamped,
 * Escape/outside-click to close, no backdrop dimming — the shared "overlays
 * paint their own surface... bounded by the viewport" contract, applied
 * non-modally) — this is that same shape, generalized to take arbitrary
 * children instead of a fixed menu-item list, and anchored to an
 * element's live bounding rect instead of a static point.
 *
 * "Non-modal" here means what it means for `ContextMenu`: no backdrop, no
 * focus trap, nothing else on the page is disabled. It still needs
 * SOMETHING to catch an outside click and close on it, which is the
 * invisible full-viewport layer below — exactly ContextMenu's own
 * mechanism, not a modal dialog's dimmed backdrop.
 */
export function AnchoredPanel({ open, onClose, anchorEl, children, className, label }: AnchoredPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null)
      return
    }
    const panel = panelRef.current
    if (!panel) return
    const margin = 8
    const rect = panel.getBoundingClientRect()
    const anchorRect = anchorEl?.getBoundingClientRect()
    const rawLeft = anchorRect ? anchorRect.left : window.innerWidth / 2 - rect.width / 2
    const rawTop = anchorRect ? anchorRect.bottom + margin : window.innerHeight / 2 - rect.height / 2
    setPosition({
      left: Math.min(Math.max(margin, rawLeft), window.innerWidth - rect.width - margin),
      top: Math.min(Math.max(margin, rawTop), window.innerHeight - rect.height - margin),
    })
  }, [open, anchorEl])

  useEffect(() => {
    if (!open) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[76]" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="false"
        aria-label={label}
        onClick={(event) => event.stopPropagation()}
        style={position ? { left: position.left, top: position.top } : { left: -9999, top: -9999 }}
        className={clsx(
          "absolute flex max-h-[80vh] w-[min(360px,92vw)] flex-col gap-3 overflow-y-auto p-4",
          OVERLAY_SURFACE,
          OVERLAY_RADIUS.panel,
          "elev-2",
          className,
        )}
      >
        {children}
      </div>
    </div>
  )
}
