import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { UhProvider } from "@/uh"
import { fact } from "@/uh/localized"
import { BulkActionPreviewDialog } from "./BulkActionPreviewDialog"

function renderDialog(props: Partial<Parameters<typeof BulkActionPreviewDialog>[0]> = {}) {
  const onClose = vi.fn()
  const onConfirm = vi.fn()
  render(
    <UhProvider>
      <BulkActionPreviewDialog
        open
        onClose={onClose}
        onConfirm={onConfirm}
        title={fact("Archive selected", "user-input")}
        affectedCount={3}
        selectedCount={3}
        confirmLabel={fact("Confirm", "user-input")}
        {...props}
      />
    </UhProvider>,
  )
  return { onClose, onConfirm }
}

describe("BulkActionPreviewDialog", () => {
  it("shows the exact affected count", async () => {
    renderDialog({ affectedCount: 12, selectedCount: 12 })
    expect(await screen.findByRole("dialog")).toBeInTheDocument()
    expect(screen.getByText("12")).toBeInTheDocument()
  })

  it("distinguishes 'will change' from 'selected' when some items will be skipped, and says why", async () => {
    renderDialog({
      affectedCount: 8,
      selectedCount: 10,
      skippedReason: fact("read-only right now", "user-input"),
    })
    // Headless UI's Dialog settles its open transition in an effect that
    // lands slightly after this render's own act() scope -- findByRole
    // (which polls, re-wrapping in act) waits for it rather than racing
    // it, same pattern components/shell/CommandPalette.dom.test.tsx uses.
    await screen.findByRole("dialog")
    expect(screen.getByText("8")).toBeInTheDocument()
    expect(screen.getByText("2")).toBeInTheDocument()
    expect(screen.getByText(/read-only right now/)).toBeInTheDocument()
  })

  it("never shows a skipped line when every selected item will actually change", async () => {
    renderDialog({ affectedCount: 5, selectedCount: 5 })
    await screen.findByRole("dialog")
    expect(screen.queryByText(/skipped/i)).not.toBeInTheDocument()
  })

  it("Confirm calls onConfirm and Cancel calls onClose, never both", async () => {
    const user = userEvent.setup()
    const { onClose, onConfirm } = renderDialog()
    await screen.findByRole("dialog")

    await user.click(screen.getByRole("button", { name: "Confirm" }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it("disables Confirm when nothing would actually change", async () => {
    renderDialog({ affectedCount: 0, selectedCount: 4, skippedReason: fact("already archived", "user-input") })
    await screen.findByRole("dialog")
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled()
  })

  it("lists the exact affected items in a bounded, scrollable region rather than clipping them", async () => {
    const labels = Array.from({ length: 30 }, (_, i) => fact(`Item ${i}`, "user-input"))
    renderDialog({ affectedCount: 30, selectedCount: 30, affectedLabels: labels })
    await screen.findByRole("dialog")

    const region = screen.getByTestId("scroll-region")
    expect(region.style.overflowY).toBe("auto")
    expect(region.style.maxHeight).toBe("200px")
    for (const label of labels) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })
})
