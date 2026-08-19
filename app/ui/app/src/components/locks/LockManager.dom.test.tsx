import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { LockManager } from "./LockManager"
import { createLock, markUnlocked } from "@/uh/locksStore"
import { recordHistory } from "@/uh/locksHistory"

describe("LockManager", () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it("shows the empty state with nothing locked yet", () => {
    render(<LockManager />)
    expect(screen.getByText(/No locks yet/)).toBeInTheDocument()
  })

  it("lists every lock and lets search narrow the list", async () => {
    const user = userEvent.setup()
    await createLock({ id: "a", label: "Danger zone", method: "password", password: "p", duration: { kind: "surface" } })
    await createLock({ id: "b", label: "Export chat", method: "password", password: "p", duration: { kind: "surface" } })

    render(<LockManager />)
    expect(screen.getByText("Danger zone")).toBeInTheDocument()
    expect(screen.getByText("Export chat")).toBeInTheDocument()

    await user.type(screen.getByLabelText("Search locks"), "danger")
    expect(screen.getByText("Danger zone")).toBeInTheDocument()
    expect(screen.queryByText("Export chat")).not.toBeInTheDocument()
  })

  it("only lets a currently-unlocked row be selected, and bulk-removes the selection after confirming", async () => {
    const user = userEvent.setup()
    await createLock({ id: "unlocked-lock", label: "Unlocked one", method: "password", password: "p", duration: { kind: "minutes", minutes: 5 } })
    await createLock({ id: "locked-lock", label: "Locked one", method: "password", password: "p", duration: { kind: "minutes", minutes: 5 } })
    markUnlocked("unlocked-lock", { kind: "minutes", minutes: 5 })

    render(<LockManager />)

    const rows = screen.getAllByRole("row").slice(1) // drop the header row
    const unlockedRow = rows.find((row) => row.textContent?.includes("Unlocked one"))!
    const lockedRow = rows.find((row) => row.textContent?.includes("Locked one"))!

    const unlockedCheckbox = unlockedRow.querySelector('input[type="checkbox"]') as HTMLInputElement
    const lockedCheckbox = lockedRow.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(unlockedCheckbox).toBeEnabled()
    expect(lockedCheckbox).toBeDisabled()

    await user.click(unlockedCheckbox)
    await user.click(screen.getByRole("button", { name: "Remove selected" }))

    // Destructive-confirm gate: still present until the keyword is typed.
    // Scope to the dialog itself -- the toolbar button behind it shares
    // the same accessible name.
    const dialog = screen.getByRole("alertdialog")
    const confirmButton = within(dialog).getByRole("button", { name: "Remove selected" })
    expect(confirmButton).toBeDisabled()
    await user.type(within(dialog).getByLabelText("Type REMOVE to confirm"), "REMOVE")
    await user.click(confirmButton)

    // Scoped to the lock table itself -- the redacted history log below it
    // legitimately keeps a "removed ... Unlocked one" entry, which is a
    // different (and correct) reason for that label text to still exist
    // somewhere on the page.
    const table = screen.getByRole("table")
    expect(within(table).queryByText("Unlocked one")).not.toBeInTheDocument()
    expect(within(table).getByText("Locked one")).toBeInTheDocument()
  })

  it("shows redacted history and exports it as text with no secret-shaped content", async () => {
    const user = userEvent.setup()
    recordHistory({ lockId: "x", label: "Danger zone", action: "created", detail: "method:password duration:surface" })
    recordHistory({ lockId: "x", label: "Danger zone", action: "unlocked" })

    render(<LockManager />)
    expect(screen.getByText("created")).toBeInTheDocument()
    expect(screen.getByText("unlocked")).toBeInTheDocument()

    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })

    await user.click(screen.getByRole("button", { name: "Export as text" }))
    expect(writeText).toHaveBeenCalledTimes(1)
    const exported = writeText.mock.calls[0][0] as string
    expect(exported).toContain("no credentials")
    expect(exported).not.toMatch(/[0-9a-f]{32,}/)
  })
})
