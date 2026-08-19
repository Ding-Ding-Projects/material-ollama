import clsx from "clsx"
import type { ReactNode } from "react"
import { useBoundedMaxHeight, type UseBoundedMaxHeightOptions } from "./a11yViewportBounds"
import type { Localized } from "./localized"

export interface ScrollRegionProps {
  readonly children: ReactNode
  /** Accessible name for the region -- pass a `Localized` value from the
   * caller's own `t()`/`Txt`; omitted entirely rather than a raw string
   * (this module can't hold its own dict — see uh/a11y* file-naming
   * constraint — so localization is the caller's job). */
  readonly ariaLabel?: Localized
  readonly className?: string
  /** Explicit override in px -- mainly for callers (and tests) that
   * already know their bound rather than deriving one from the viewport. */
  readonly maxHeightPx?: number
  readonly boundsOptions?: UseBoundedMaxHeightOptions
}

/**
 * The mechanism behind "an overlay stays viewport-bounded and scrolls
 * internally rather than clipping": a bounded max-height (explicit or
 * derived live from the viewport) plus `overflow-y: auto`, so content
 * taller than the bound scrolls in place instead of being cut off or
 * pushing the surrounding dialog past the screen edge. `overflow-y` and
 * `maxHeight` are set as real inline styles (not only Tailwind classes)
 * so they're always in effect regardless of whether the compiled
 * stylesheet is present -- and so a test can read them back directly.
 */
export function ScrollRegion({ children, ariaLabel, className, maxHeightPx, boundsOptions }: ScrollRegionProps) {
  const computedMaxHeight = useBoundedMaxHeight(boundsOptions)
  const maxHeight = maxHeightPx ?? computedMaxHeight

  return (
    <div
      role={ariaLabel ? "region" : undefined}
      aria-label={ariaLabel}
      data-testid="scroll-region"
      className={clsx("min-h-0 overflow-y-auto", className)}
      style={{ overflowY: "auto", maxHeight: `${maxHeight}px` }}
    >
      {children}
    </div>
  )
}

export interface WideContentScrollerProps {
  readonly children: ReactNode
  readonly ariaLabel?: Localized
  readonly className?: string
}

/**
 * Wraps wide content (a data table, a long CSV/TSV preview, a code block)
 * in its OWN horizontally scrolling container so it never forces the page
 * body itself to scroll sideways — the exact property
 * `uh/a11yLayoutAudit.ts`'s `auditWideContent()` checks for. Every
 * exports/bulk surface that renders tabular or monospace content wraps it
 * in this rather than letting it overflow into an ancestor.
 */
export function WideContentScroller({ children, ariaLabel, className }: WideContentScrollerProps) {
  return (
    <div
      role={ariaLabel ? "region" : undefined}
      aria-label={ariaLabel}
      data-testid="wide-content-scroller"
      className={clsx("w-full overflow-x-auto", className)}
      style={{ overflowX: "auto" }}
    >
      {children}
    </div>
  )
}
