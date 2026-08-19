import { render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { auditWideContent, isUncontainedOverflow, pageNeverScrollsSideways } from "./a11yLayoutAudit"

// jsdom never runs a real layout engine, so `scrollWidth`/`clientWidth`
// are always 0 on every element unless overridden -- these tests define
// them explicitly (a standard technique for layout-dependent code under
// jsdom) to exercise the real comparison logic rather than the parts of
// a real browser this module doesn't (and can't) reimplement.
function stubBoxSize(element: HTMLElement, scrollWidth: number, clientWidth: number) {
  Object.defineProperty(element, "scrollWidth", { configurable: true, value: scrollWidth })
  Object.defineProperty(element, "clientWidth", { configurable: true, value: clientWidth })
}

afterEach(() => {
  document.body.innerHTML = ""
})

describe("isUncontainedOverflow", () => {
  it("is false when content doesn't exceed the box", () => {
    const el = document.createElement("div")
    stubBoxSize(el, 400, 400)
    expect(isUncontainedOverflow(el)).toBe(false)
  })

  it("is true when content is wider than the box and overflow-x is the default (visible)", () => {
    const el = document.createElement("div")
    stubBoxSize(el, 900, 400)
    expect(isUncontainedOverflow(el)).toBe(true)
  })

  it("is false when the element has opted into its own horizontal scrollbar", () => {
    const el = document.createElement("div")
    stubBoxSize(el, 900, 400)
    el.style.overflowX = "auto"
    expect(isUncontainedOverflow(el)).toBe(false)

    el.style.overflowX = "scroll"
    expect(isUncontainedOverflow(el)).toBe(false)
  })

  it("stays true for overflow-x: hidden -- clipping content is not the same as scrolling it", () => {
    const el = document.createElement("div")
    stubBoxSize(el, 900, 400)
    el.style.overflowX = "hidden"
    expect(isUncontainedOverflow(el)).toBe(true)
  })
})

describe("auditWideContent", () => {
  it("finds nothing wrong in a table that scrolls in its own container", () => {
    const { container } = render(
      <div data-testid="page">
        <div data-testid="table-scroller" style={{ overflowX: "auto" }}>
          <table>
            <tbody>
              <tr>
                <td>content</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>,
    )
    const scroller = container.querySelector('[data-testid="table-scroller"]') as HTMLElement
    stubBoxSize(scroller, 1400, 500)
    expect(auditWideContent(container)).toEqual([])
  })

  it("reports the exact element whose wide content has nowhere to scroll", () => {
    const { container } = render(
      <div data-testid="page">
        <div data-testid="offender">
          <table>
            <tbody>
              <tr>
                <td>content</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>,
    )
    const offender = container.querySelector('[data-testid="offender"]') as HTMLElement
    stubBoxSize(offender, 1400, 500)

    const findings = auditWideContent(container)
    expect(findings).toHaveLength(1)
    expect(findings[0]?.element).toBe(offender)
    expect(findings[0]?.description).toContain('data-testid="offender"')
  })
})

describe("pageNeverScrollsSideways", () => {
  it("is true when the document is no wider than the viewport", () => {
    stubBoxSize(document.documentElement, 1024, 1024)
    expect(pageNeverScrollsSideways()).toBe(true)
  })

  it("is false the moment the document grows wider than the viewport", () => {
    stubBoxSize(document.documentElement, 1400, 1024)
    expect(pageNeverScrollsSideways()).toBe(false)
  })
})
