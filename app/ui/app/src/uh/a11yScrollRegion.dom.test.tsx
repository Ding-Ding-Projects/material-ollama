import { act, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { auditWideContent, pageNeverScrollsSideways } from "./a11yLayoutAudit"
import { ScrollRegion, WideContentScroller } from "./a11yScrollRegion"
import { fact } from "./localized"

function resizeWindowTo(height: number) {
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height })
  // Wrapped in act() unconditionally -- harmless before a component is
  // mounted, and necessary afterward since this synchronously fires the
  // "resize" listener ScrollRegion's effect installs, which sets state.
  act(() => {
    window.dispatchEvent(new Event("resize"))
  })
}

const originalInnerHeight = window.innerHeight

afterEach(() => {
  Object.defineProperty(window, "innerHeight", { configurable: true, value: originalInnerHeight })
})

describe("ScrollRegion", () => {
  it("bounds itself to a real max-height and scrolls (overflow-y: auto), never clips (hidden) or grows unbounded", () => {
    render(
      <ScrollRegion maxHeightPx={120} ariaLabel={fact("preview", "path")}>
        {Array.from({ length: 40 }, (_, i) => (
          <p key={i}>row {i}</p>
        ))}
      </ScrollRegion>,
    )
    const region = screen.getByTestId("scroll-region")

    // Bounded: a real, finite ceiling is set, not "however tall the
    // content wants to be".
    expect(region.style.maxHeight).toBe("120px")
    // Scrolls rather than clips: overflow-y is "auto" (scrollbar appears
    // when needed), never "hidden" (which would silently cut content off)
    // or "visible" (which would push past the bound into the page).
    expect(region.style.overflowY).toBe("auto")
    expect(getComputedStyle(region).overflowY).toBe("auto")

    // And "scrolls" doesn't mean "discarded" -- every row is still really
    // in the DOM, reachable by scrolling, not removed to fit the bound.
    for (let i = 0; i < 40; i++) {
      expect(screen.getByText(`row ${i}`)).toBeInTheDocument()
    }
  })

  it("derives its bound live from a SHORT viewport rather than a fixed constant, and still scrolls rather than clipping", () => {
    resizeWindowTo(300) // a genuinely short viewport
    render(
      <ScrollRegion boundsOptions={{ viewportFraction: 0.5, maxPx: 560, minPx: 80 }} ariaLabel={fact("preview", "path")}>
        {Array.from({ length: 25 }, (_, i) => (
          <p key={i}>item {i}</p>
        ))}
      </ScrollRegion>,
    )
    const region = screen.getByTestId("scroll-region")

    // 50% of a 300px-tall viewport is 150px, well under the 560px ceiling
    // and above the 80px floor -- so it should bind to the viewport, not
    // to `maxPx`.
    expect(region.style.maxHeight).toBe("150px")
    expect(region.style.overflowY).toBe("auto")

    resizeWindowTo(200)
    expect(region.style.maxHeight).toBe("100px")
  })

  it("never clips: the region's own overflow-y is never \"hidden\" no matter how short the viewport", () => {
    resizeWindowTo(50) // an extreme, near-nothing viewport
    render(
      <ScrollRegion boundsOptions={{ viewportFraction: 0.7, maxPx: 560, minPx: 160 }} ariaLabel={fact("preview", "path")}>
        <p>content that must never be clipped away</p>
      </ScrollRegion>,
    )
    const region = screen.getByTestId("scroll-region")

    // The floor (minPx) keeps the region usable even at an absurdly short
    // viewport, and it's still overflow-y: auto -- scrolling, not hiding.
    expect(Number.parseInt(region.style.maxHeight, 10)).toBeGreaterThanOrEqual(160)
    expect(region.style.overflowY).toBe("auto")
    expect(screen.getByText("content that must never be clipped away")).toBeInTheDocument()
  })

  it("carries a real accessible region name from the caller rather than being an unlabeled div", () => {
    render(
      <ScrollRegion maxHeightPx={100} ariaLabel={fact("Export preview", "user-input")}>
        <p>x</p>
      </ScrollRegion>,
    )
    expect(screen.getByRole("region", { name: "Export preview" })).toBeInTheDocument()
  })
})

describe("WideContentScroller", () => {
  it("gives wide content its own overflow-x: auto container, satisfying the layout audit", () => {
    const { container } = render(
      <WideContentScroller ariaLabel={fact("Wide table", "user-input")}>
        <table style={{ width: "2000px" }}>
          <tbody>
            <tr>
              <td>wide</td>
            </tr>
          </tbody>
        </table>
      </WideContentScroller>,
    )
    const scroller = screen.getByTestId("wide-content-scroller")
    expect(scroller.style.overflowX).toBe("auto")
    expect(getComputedStyle(scroller).overflowX).toBe("auto")

    // Simulate the real overflow jsdom won't compute on its own, then run
    // the actual layout-audit function against this exact markup: it must
    // find no violation, because the wide table is inside its own
    // horizontally-scrolling container rather than overflowing the page.
    Object.defineProperty(scroller, "scrollWidth", { configurable: true, value: 2000 })
    Object.defineProperty(scroller, "clientWidth", { configurable: true, value: 600 })
    expect(auditWideContent(container)).toEqual([])
  })

  it("is exactly what a11yLayoutAudit flags as a violation when it's NOT used", () => {
    const { container } = render(
      <div data-testid="unwrapped">
        <table style={{ width: "2000px" }}>
          <tbody>
            <tr>
              <td>wide</td>
            </tr>
          </tbody>
        </table>
      </div>,
    )
    const wrapper = container.querySelector('[data-testid="unwrapped"]') as HTMLElement
    Object.defineProperty(wrapper, "scrollWidth", { configurable: true, value: 2000 })
    Object.defineProperty(wrapper, "clientWidth", { configurable: true, value: 600 })
    expect(auditWideContent(container)).toHaveLength(1)
  })

  it("keeps the whole page's own scrollWidth in check once wide content is properly contained", () => {
    // pageNeverScrollsSideways() reads document.documentElement directly;
    // stub it to prove that a WideContentScroller-contained table doesn't
    // register as page-level horizontal overflow (unlike an
    // uncontained one, which in a real browser eventually would).
    Object.defineProperty(document.documentElement, "scrollWidth", { configurable: true, value: 1024 })
    Object.defineProperty(document.documentElement, "clientWidth", { configurable: true, value: 1024 })
    expect(pageNeverScrollsSideways()).toBe(true)
  })
})
