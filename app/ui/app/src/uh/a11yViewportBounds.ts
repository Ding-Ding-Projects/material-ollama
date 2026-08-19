import { useEffect, useState } from "react"

export interface UseBoundedMaxHeightOptions {
  /** Fraction of the current viewport height to allow -- e.g. 0.7 for
   * roughly 70vh, matching the design's own overlay convention (see
   * md3/Dialog.tsx's `max-h-[80vh]`). */
  readonly viewportFraction?: number
  /** Hard ceiling in px, regardless of how tall the viewport is. */
  readonly maxPx?: number
  /** Floor in px, so a very short viewport (or a misreported 0 in a test
   * environment) never collapses the region to nothing. */
  readonly minPx?: number
}

function computeBoundedHeight(options: Required<UseBoundedMaxHeightOptions>): number {
  const viewportHeight = typeof window !== "undefined" && window.innerHeight > 0 ? window.innerHeight : options.maxPx
  const bounded = Math.round(viewportHeight * options.viewportFraction)
  return Math.max(options.minPx, Math.min(options.maxPx, bounded))
}

/**
 * A live-updating, viewport-bounded max-height in px — the mechanism
 * behind "an overlay stays viewport-bounded and scrolls internally rather
 * than clipping" for surfaces that need a concrete pixel bound (rather
 * than a CSS `vh` unit, which can't be read back for the layout audit or
 * combined with a hard ceiling/floor in one expression). Recomputes on
 * window resize.
 */
export function useBoundedMaxHeight(options: UseBoundedMaxHeightOptions = {}): number {
  const resolved: Required<UseBoundedMaxHeightOptions> = {
    viewportFraction: options.viewportFraction ?? 0.7,
    maxPx: options.maxPx ?? 560,
    minPx: options.minPx ?? 160,
  }
  const [maxHeight, setMaxHeight] = useState(() => computeBoundedHeight(resolved))

  useEffect(() => {
    const handleResize = () => setMaxHeight(computeBoundedHeight(resolved))
    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved.viewportFraction, resolved.maxPx, resolved.minPx])

  return maxHeight
}
