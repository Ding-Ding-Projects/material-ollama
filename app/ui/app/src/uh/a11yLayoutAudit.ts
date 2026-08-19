// A real, runnable layout audit: "the body never scrolls sideways while
// wide content scrolls in its own container." Two independent checks —
// page-level (nothing ever forces `<html>`/`<body>` itself to grow wider
// than the viewport) and element-level (any element whose content IS
// wider than its box has been told to handle that with its own
// `overflow-x: auto|scroll`, rather than silently overflowing into its
// ancestors, which is what eventually forces the page-level check to
// fail). uh/a11yScrollRegion.tsx's `WideContentScroller` is the shipped
// fix for the element-level failure this module detects.

export interface LayoutOverflowFinding {
  readonly element: Element
  /** A short, stable-enough description for a log line or test
   * assertion -- tag name plus id/data-testid/class when present. */
  readonly description: string
}

function describeElement(element: Element): string {
  const tag = element.tagName.toLowerCase()
  const id = element.id ? `#${element.id}` : ""
  const testId = element.getAttribute("data-testid")
  const testIdPart = testId ? `[data-testid="${testId}"]` : ""
  return `${tag}${id}${testIdPart}`
}

/**
 * True when `element`'s content is wider than its own box AND it hasn't
 * been configured to handle that with its own horizontal scrollbar. An
 * element that's simply not overflowing returns `false`; an element that
 * IS overflowing but has deliberately opted into `overflow-x: auto` or
 * `overflow-x: scroll` (the "wide content scrolls in its own container"
 * mechanism) also returns `false` -- only "overflowing with nowhere for
 * it to go" counts as a violation.
 */
export function isUncontainedOverflow(element: Element): boolean {
  if (element.scrollWidth <= element.clientWidth) return false
  const overflowX = getComputedStyle(element).overflowX
  return overflowX !== "auto" && overflowX !== "scroll"
}

/** Walks `root` and its descendants, reporting every element with
 * uncontained horizontal overflow. Pass the subtree you actually care
 * about (a dialog body, a preview pane) rather than the whole document
 * when you only need to check one surface. */
export function auditWideContent(root: Element): LayoutOverflowFinding[] {
  const findings: LayoutOverflowFinding[] = []
  const walk = (element: Element) => {
    if (isUncontainedOverflow(element)) {
      findings.push({ element, description: describeElement(element) })
    }
    for (const child of Array.from(element.children)) walk(child)
  }
  walk(root)
  return findings
}

/**
 * True exactly when the page body would never need to scroll sideways —
 * i.e. `<html>`'s rendered content is no wider than the viewport it's
 * being shown in. This is the top-level assertion every app surface must
 * satisfy; `auditWideContent()` above is how a violation gets FOUND
 * (some descendant overflowing without its own scroll container) before
 * it bubbles up into this failing.
 */
export function pageNeverScrollsSideways(doc: Document = document): boolean {
  const root = doc.documentElement
  return root.scrollWidth <= root.clientWidth
}
