import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { Checkbox } from "./Checkbox"

/**
 * The point of keeping a real <input type="checkbox"> under the MD3 drawing
 * is that the semantics come from the platform rather than from us. These
 * assert the parts that a div-with-role would have had to reimplement, and
 * would have got subtly wrong.
 */
describe("md3 Checkbox", () => {
  it("exposes a real checkbox role and accessible name", () => {
    render(<Checkbox checked={false} onChange={() => {}} label="Select row" />)
    expect(screen.getByRole("checkbox", { name: "Select row" })).toBeTruthy()
  })

  it("reports mixed rather than checked when indeterminate", () => {
    render(<Checkbox checked={false} indeterminate onChange={() => {}} label="Select all" />)
    const box = screen.getByRole("checkbox", { name: "Select all" }) as HTMLInputElement
    expect(box.getAttribute("aria-checked")).toBe("mixed")
    // indeterminate is a property with no attribute, so it can only be set
    // imperatively -- and it is the half most easily dropped in a rewrite.
    expect(box.indeterminate).toBe(true)
  })

  it("carries the shift key through, which is what range-select depends on", () => {
    const onChange = vi.fn()
    render(<Checkbox checked={false} onChange={onChange} label="Select row" />)
    fireEvent.click(screen.getByRole("checkbox"), { shiftKey: true })
    expect(onChange).toHaveBeenCalledWith(true, expect.objectContaining({ shiftKey: true }))
  })

  it("toggles from the current value rather than from the event target", () => {
    const onChange = vi.fn()
    render(<Checkbox checked onChange={onChange} label="Select row" />)
    fireEvent.click(screen.getByRole("checkbox"))
    expect(onChange).toHaveBeenCalledWith(false, expect.anything())
  })

  it("does not fire when disabled", () => {
    const onChange = vi.fn()
    render(<Checkbox checked={false} disabled onChange={onChange} label="Select row" />)
    fireEvent.click(screen.getByRole("checkbox"))
    expect(onChange).not.toHaveBeenCalled()
  })
})
