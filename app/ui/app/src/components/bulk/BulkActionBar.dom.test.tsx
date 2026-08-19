import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { UhProvider } from "@/uh"
import { fact } from "@/uh/localized"
import { BulkActionBar, type BulkAction } from "./BulkActionBar"
import { BulkSelectAllHeader } from "./BulkSelectAllHeader"
import { useBulkSelection, type UseBulkSelectionResult } from "./useBulkSelection"

const ids = ["a", "b", "c", "d", "e"]

function Harness({
  actions,
  totalMatchCount,
  onSelectionRef,
}: {
  actions: BulkAction[]
  totalMatchCount?: number
  onSelectionRef?: (selection: UseBulkSelectionResult) => void
}) {
  const selection = useBulkSelection({ ids, totalMatchCount })
  onSelectionRef?.(selection)
  return (
    <UhProvider>
      <BulkSelectAllHeader ids={ids} selection={selection} />
      <button type="button" onClick={() => selection.toggle("a")}>
        toggle a
      </button>
      <button type="button" onClick={() => selection.toggle("b")}>
        toggle b
      </button>
      <BulkActionBar ids={ids} selection={selection} actions={actions} />
    </UhProvider>
  )
}

describe("BulkActionBar", () => {
  it("renders nothing while the selection is empty", () => {
    render(<Harness actions={[]} />)
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument()
  })

  it("appears the instant something is selected, with the exact count", async () => {
    const user = userEvent.setup()
    render(<Harness actions={[]} />)

    await user.click(screen.getByRole("button", { name: "toggle a" }))
    expect(screen.getByText("1 selected")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "toggle b" }))
    expect(screen.getByText("2 selected")).toBeInTheDocument()
  })

  it("disappears again the instant the selection returns to empty", async () => {
    const user = userEvent.setup()
    render(<Harness actions={[]} />)

    await user.click(screen.getByRole("button", { name: "toggle a" }))
    expect(screen.getByText("1 selected")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "toggle a" }))
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument()
  })

  it("says plainly 'on this page' vs 'across every match' -- never an ambiguous bare count", async () => {
    let selection: UseBulkSelectionResult | undefined
    const user = userEvent.setup()
    render(<Harness actions={[]} totalMatchCount={400} onSelectionRef={(s) => (selection = s)} />)

    // The select-all entry point lives in the always-visible header, not
    // in this bar -- the bar itself doesn't exist yet with 0 selected.
    await user.click(screen.getByRole("checkbox", { name: "Select all on this page" }))
    expect(screen.getByText(`${ids.length} selected on this page`)).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Select all matching" }))
    expect(screen.getByText("400 selected across every match")).toBeInTheDocument()
    expect(selection?.scope).toBe("all")
  })

  it("Clear selection empties it and hides the bar again", async () => {
    const user = userEvent.setup()
    render(<Harness actions={[]} />)
    await user.click(screen.getByRole("button", { name: "toggle a" }))
    await user.click(screen.getByRole("button", { name: "toggle b" }))
    await user.click(screen.getByRole("button", { name: "Clear selection" }))
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument()
  })

  it("Invert selection flips membership across the whole loaded set", async () => {
    const user = userEvent.setup()
    render(<Harness actions={[]} />)
    await user.click(screen.getByRole("button", { name: "toggle a" }))
    expect(screen.getByText("1 selected")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Invert selection" }))
    expect(screen.getByText(`${ids.length - 1} selected`)).toBeInTheDocument()
  })

  it("runs a plain action (no confirm) immediately with the exact selected ids", async () => {
    const user = userEvent.setup()
    const run = vi.fn()
    render(<Harness actions={[{ key: "act", label: fact("Do it", "user-input"), run }]} />)

    await user.click(screen.getByRole("button", { name: "toggle a" }))
    await user.click(screen.getByRole("button", { name: "toggle b" }))
    await user.click(screen.getByRole("button", { name: "Do it" }))

    expect(run).toHaveBeenCalledTimes(1)
    expect(run.mock.calls[0]?.[0]).toEqual(expect.arrayContaining(["a", "b"]))
  })

  it("a {kind:'preview'} action shows the exact affected count and requires a confirm click before running", async () => {
    const user = userEvent.setup()
    const run = vi.fn()
    render(
      <Harness
        actions={[
          {
            key: "act",
            label: fact("Archive selected", "user-input"),
            run,
            confirm: { kind: "preview", body: fact("This archives the selected rows.", "user-input") },
          },
        ]}
      />,
    )

    await user.click(screen.getByRole("button", { name: "toggle a" }))
    await user.click(screen.getByRole("button", { name: "toggle b" }))
    await user.click(screen.getByRole("button", { name: "Archive selected" }))

    expect(run).not.toHaveBeenCalled()
    expect(await screen.findByRole("dialog")).toBeInTheDocument()
    expect(screen.getByText("2")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Confirm" }))
    expect(run).toHaveBeenCalledTimes(1)
  })

  it("a {kind:'destructive'} action stays inert until the exact keyword is typed", async () => {
    const user = userEvent.setup()
    const run = vi.fn()
    render(
      <Harness
        actions={[
          {
            key: "act",
            label: fact("Delete selected", "user-input"),
            run,
            confirm: { kind: "destructive", keyword: "DELETE", body: fact("This deletes the selected rows.", "user-input") },
          },
        ]}
      />,
    )

    await user.click(screen.getByRole("button", { name: "toggle a" }))
    await user.click(screen.getByRole("button", { name: "Delete selected" }))

    const dialog = await screen.findByRole("alertdialog")
    // The confirm button inside the gate shares its label with the
    // trigger that opened it -- scope to the dialog to reach the right one.
    const confirmButton = within(dialog).getByRole("button", { name: "Delete selected" })
    expect(confirmButton).toBeDisabled()
    expect(run).not.toHaveBeenCalled()

    const input = within(dialog).getByPlaceholderText("Type DELETE to confirm")
    await user.type(input, "delete")
    expect(confirmButton).toBeEnabled()

    await user.click(confirmButton)
    expect(run).toHaveBeenCalledTimes(1)
  })
})
