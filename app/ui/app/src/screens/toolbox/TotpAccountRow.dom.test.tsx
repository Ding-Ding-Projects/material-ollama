import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { UhProvider } from "@/uh"
import { TotpAccountRow } from "./TotpAccountRow"
import type { TotpAccount, TotpCodeEntry } from "./totpApi"

const ACCOUNT: TotpAccount = {
  id: "acct-1",
  name: "GitHub",
  algorithm: "SHA1",
  digits: 6,
  period: 30,
  createdAt: "2026-01-01T00:00:00Z",
  secretSet: true,
}

const CODE: TotpCodeEntry = {
  id: "acct-1",
  name: "GitHub",
  code: "123456",
  algorithm: "SHA1",
  digits: 6,
  period: 30,
  secondsRemaining: 17,
}

function renderRow(onDelete = vi.fn().mockResolvedValue(undefined)) {
  render(
    <UhProvider>
      <TotpAccountRow account={ACCOUNT} code={CODE} onDelete={onDelete} deleting={false} />
    </UhProvider>,
  )
  return { onDelete }
}

// The delete confirmation is this account's super-confirmation gate: it
// must call the real DELETE /api/v1/uh/totp/accounts/{id} handler (via
// onDelete) only once the exact keyword "REMOVE" is typed -- not a
// near-miss, not a click alone.
describe("TotpAccountRow", () => {
  it("renders the live code, grouped, plus a non-colour-only countdown", () => {
    renderRow()
    expect(screen.getByText("123 456")).toBeInTheDocument()
    // The numeric seconds-remaining readout beside the bar -- proves the
    // countdown carries a real text signal, not just a coloured bar.
    expect(screen.getByText("17s")).toBeInTheDocument()
  })

  it("keeps the delete action inert until the exact REMOVE keyword is typed", async () => {
    const user = userEvent.setup()
    const { onDelete } = renderRow()

    await user.click(screen.getByRole("button", { name: /Remove account — GitHub/ }))
    const confirmButton = await screen.findByRole("button", { name: "Remove account" })
    const input = screen.getByLabelText("Type REMOVE to confirm")

    // Untouched: disabled, and onDelete must not have been called by
    // merely opening the dialog.
    expect(confirmButton).toBeDisabled()
    expect(onDelete).not.toHaveBeenCalled()

    // A near-miss keyword stays disabled and clicking it must not fire.
    await user.type(input, "REMOV")
    expect(confirmButton).toBeDisabled()
    await user.click(confirmButton)
    expect(onDelete).not.toHaveBeenCalled()

    // The exact keyword arms it.
    await user.clear(input)
    await user.type(input, "REMOVE")
    expect(confirmButton).toBeEnabled()

    await user.click(confirmButton)
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onDelete).toHaveBeenCalledWith("acct-1")
  })

  it("shows the real failure and a retry route when the delete call fails", async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn().mockRejectedValueOnce(new Error("account is still in use elsewhere"))
    renderRow(onDelete)

    await user.click(screen.getByRole("button", { name: /Remove account — GitHub/ }))
    await user.type(screen.getByLabelText("Type REMOVE to confirm"), "REMOVE")
    await user.click(screen.getByRole("button", { name: "Remove account" }))

    expect(await screen.findByText("account is still in use elsewhere")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument()
  })
})
