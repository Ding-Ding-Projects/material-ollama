import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"
import { Lockable } from "./Lockable"

function TestHarness({ id }: { id: string }) {
  return (
    <Lockable id={id} label="Danger zone">
      <button type="button">Real content</button>
    </Lockable>
  )
}

async function createPasswordLock(user: ReturnType<typeof userEvent.setup>, password = "sw0rdfish") {
  fireEvent.contextMenu(screen.getByRole("button", { name: "Real content" }))
  await user.click(screen.getByRole("menuitem", { name: "Lock this element…" }))

  await screen.findByLabelText("Password")
  await user.type(screen.getByLabelText("Password"), password)
  await user.type(screen.getByLabelText("Confirm password"), password)
  await user.click(screen.getByRole("button", { name: "Create lock" }))

  await waitFor(() => {
    expect(screen.queryByRole("button", { name: "Real content" })).not.toBeInTheDocument()
  })
}

describe("Lockable", () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it("renders the real children when there is no lock, and offers 'Lock this element…'", () => {
    render(<TestHarness id="lockable-unlocked" />)
    expect(screen.getByRole("button", { name: "Real content" })).toBeInTheDocument()

    fireEvent.contextMenu(screen.getByRole("button", { name: "Real content" }))
    expect(screen.getByRole("menuitem", { name: "Lock this element…" })).toBeInTheDocument()
  })

  it("locking replaces the real children with a locked placeholder -- nothing reachable underneath", async () => {
    const user = userEvent.setup()
    render(<TestHarness id="lockable-locked" />)

    await createPasswordLock(user)

    // The real button is genuinely unmounted, not merely hidden or disabled.
    expect(screen.queryByRole("button", { name: "Real content" })).not.toBeInTheDocument()
    expect(screen.getByText("Locked")).toBeInTheDocument()
  })

  it("a wrong password stays locked and shows the mismatch; the right one reveals the children again", async () => {
    const user = userEvent.setup()
    render(<TestHarness id="lockable-unlock-flow" />)
    await createPasswordLock(user, "correct-password")

    // Open the unlock prompt from the locked placeholder itself.
    await user.click(screen.getByRole("button", { name: /Danger zone/ }))
    await screen.findByLabelText("Password")

    await user.type(screen.getByLabelText("Password"), "wrong-password")
    await user.click(screen.getByRole("button", { name: "Unlock" }))

    await screen.findByText("That didn’t match.")
    expect(screen.queryByRole("button", { name: "Real content" })).not.toBeInTheDocument()

    await user.clear(screen.getByLabelText("Password"))
    await user.type(screen.getByLabelText("Password"), "correct-password")
    await user.click(screen.getByRole("button", { name: "Unlock" }))

    await screen.findByRole("button", { name: "Real content" })
  })

  it("once genuinely unlocked, the context menu offers Remove lock -- and removing it restores the unlocked state", async () => {
    const user = userEvent.setup()
    render(<TestHarness id="lockable-remove" />)
    await createPasswordLock(user, "correct-password")

    await user.click(screen.getByRole("button", { name: /Danger zone/ }))
    await screen.findByLabelText("Password")
    await user.type(screen.getByLabelText("Password"), "correct-password")
    await user.click(screen.getByRole("button", { name: "Unlock" }))
    await screen.findByRole("button", { name: "Real content" })

    fireEvent.contextMenu(screen.getByRole("button", { name: "Real content" }))
    expect(screen.getByRole("menuitem", { name: "Remove lock…" })).toBeInTheDocument()
    await user.click(screen.getByRole("menuitem", { name: "Remove lock…" }))

    // Now completely unlocked again -- back to offering "Lock this element…".
    fireEvent.contextMenu(screen.getByRole("button", { name: "Real content" }))
    expect(screen.getByRole("menuitem", { name: "Lock this element…" })).toBeInTheDocument()
  })

  it("two independently locked elements never share a credential", async () => {
    const user = userEvent.setup()

    function TwoHarness() {
      return (
        <>
          <Lockable id="lockable-two-a" label="A">
            <button type="button">Content A</button>
          </Lockable>
          <Lockable id="lockable-two-b" label="B">
            <button type="button">Content B</button>
          </Lockable>
        </>
      )
    }
    render(<TwoHarness />)

    fireEvent.contextMenu(screen.getByRole("button", { name: "Content A" }))
    await user.click(screen.getByRole("menuitem", { name: "Lock this element…" }))
    await user.type(screen.getByLabelText("Password"), "password-a")
    await user.type(screen.getByLabelText("Confirm password"), "password-a")
    await user.click(screen.getByRole("button", { name: "Create lock" }))
    await waitFor(() => expect(screen.queryByRole("button", { name: "Content A" })).not.toBeInTheDocument())

    fireEvent.contextMenu(screen.getByRole("button", { name: "Content B" }))
    await user.click(screen.getByRole("menuitem", { name: "Lock this element…" }))
    await user.type(screen.getByLabelText("Password"), "password-b")
    await user.type(screen.getByLabelText("Confirm password"), "password-b")
    await user.click(screen.getByRole("button", { name: "Create lock" }))
    await waitFor(() => expect(screen.queryByRole("button", { name: "Content B" })).not.toBeInTheDocument())

    // A's password does not unlock B.
    await user.click(screen.getByRole("button", { name: /^B/ }))
    await screen.findByLabelText("Password")
    await user.type(screen.getByLabelText("Password"), "password-a")
    await user.click(screen.getByRole("button", { name: "Unlock" }))
    await screen.findByText("That didn’t match.")
    expect(screen.queryByRole("button", { name: "Content B" })).not.toBeInTheDocument()
  })
})
