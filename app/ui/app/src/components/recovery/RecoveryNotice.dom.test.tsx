import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { UhProvider } from "@/uh"
import { RecoveryNotice } from "./RecoveryNotice"
import { fact } from "@/uh"

function renderNotice(overrides: Partial<Parameters<typeof RecoveryNotice>[0]> = {}) {
  const onRetry = vi.fn()
  render(
    <UhProvider>
      <RecoveryNotice
        state="test-state"
        severity="error"
        title={fact("Something is missing", "user-input")}
        explanation={fact("Here is what happened and what to do.", "user-input")}
        onRetry={onRetry}
        {...overrides}
      />
    </UhProvider>,
  )
  return { onRetry }
}

describe("RecoveryNotice", () => {
  it("renders the state name, title, and explanation, and never sends the user to a web search", () => {
    renderNotice()

    expect(screen.getByTestId("recovery-notice-test-state")).toBeInTheDocument()
    expect(screen.getByText("Something is missing")).toBeInTheDocument()
    expect(screen.getByText("Here is what happened and what to do.")).toBeInTheDocument()
    // No link anywhere in the notice -- the hard rule this component
    // exists to satisfy is "never a link out to a web search".
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })

  it("renders the server's own reason and next-step facts verbatim when supplied", () => {
    renderNotice({
      reason: "list installed models: dial tcp 127.0.0.1:11434: connect: connection refused",
      nextStep: "Install Docker Desktop and ensure docker is on PATH.",
    })

    const notice = screen.getByTestId("recovery-notice-test-state")
    expect(notice).toHaveTextContent(
      "dial tcp 127.0.0.1:11434: connect: connection refused",
    )
    expect(notice).toHaveTextContent("Install Docker Desktop and ensure docker is on PATH.")
  })

  it("Retry actually retries -- clicking it calls the real onRetry handler", async () => {
    const user = userEvent.setup()
    const { onRetry } = renderNotice()

    await user.click(screen.getByRole("button", { name: "Retry" }))

    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it("shows the Retry button as busy while a retry is in flight", () => {
    renderNotice({ retrying: true })

    expect(screen.getByRole("button", { name: "Retry" })).toHaveAttribute("aria-busy", "true")
  })

  it("renders a real, working next-action control distinct from Retry when one is supplied", async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    renderNotice({
      action: { label: fact("Refresh catalog", "user-input"), onClick: onAction },
    })

    const actionButton = screen.getByRole("button", { name: "Refresh catalog" })
    await user.click(actionButton)

    expect(onAction).toHaveBeenCalledTimes(1)
    // The action and Retry are two distinct controls, not one button doing
    // double duty.
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument()
  })

  it("uses an assertive alert role for an error notice and a polite status role otherwise", () => {
    const { rerender } = render(
      <UhProvider>
        <RecoveryNotice
          state="err"
          severity="error"
          title={fact("Down", "user-input")}
          explanation={fact("It's down.", "user-input")}
          onRetry={() => {}}
        />
      </UhProvider>,
    )
    expect(screen.getByRole("alert")).toBeInTheDocument()

    rerender(
      <UhProvider>
        <RecoveryNotice
          state="warn"
          severity="warning"
          title={fact("Heads up", "user-input")}
          explanation={fact("Just a heads up.", "user-input")}
          onRetry={() => {}}
        />
      </UhProvider>,
    )
    expect(screen.getByRole("status")).toBeInTheDocument()
  })
})
