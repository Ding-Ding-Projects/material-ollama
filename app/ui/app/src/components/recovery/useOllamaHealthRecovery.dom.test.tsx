import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { UhProvider } from "@/uh"
import { OllamaHealthNotice } from "./OllamaHealthNotice"

function installVersionFetchMock(sequence: Array<"ok" | "fail">) {
  const calls: string[] = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    calls.push(url)
    if (!url.includes("/api/version")) {
      throw new Error(`Unexpected fetch in test: ${url}`)
    }
    const next = sequence[Math.min(calls.length - 1, sequence.length - 1)]
    if (next === "ok") {
      return { ok: true, json: async () => ({ version: "0.1.2" }) } as Response
    }
    // fetchHealth() (src/api.ts) treats a network-level rejection the same
    // way it treats a non-ok response -- either way it resolves to false.
    throw new Error("network error: connect ECONNREFUSED")
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

// The real, end-to-end shape of the brief's first hard requirement: a
// genuinely failed request produces a visible RecoveryNotice, and its
// Retry button re-issues that exact request rather than merely flipping
// local state.
describe("OllamaHealthNotice / useOllamaHealthRecovery", () => {
  it("renders the notice for a failed fetch, and Retry re-issues the request", async () => {
    const user = userEvent.setup()
    const fetchMock = installVersionFetchMock(["fail", "ok"])

    render(
      <UhProvider>
        <OllamaHealthNotice />
      </UhProvider>,
    )

    // First real GET /api/version failed -- the notice must appear.
    await screen.findByTestId("recovery-notice-ollama-down")
    expect(screen.getByText("Ollama isn't responding")).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Clicking Retry issues a SECOND real fetch to the same endpoint --
    // not a no-op, not a cached success.
    await user.click(screen.getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock.mock.calls[1][0]).toEqual(fetchMock.mock.calls[0][0])

    // That second request succeeded, so the notice clears -- a stale
    // "still down" banner after a real recovery would be its own defect.
    await waitFor(() => {
      expect(screen.queryByTestId("recovery-notice-ollama-down")).not.toBeInTheDocument()
    })
  })

  it("stays silent once the runtime answers", async () => {
    installVersionFetchMock(["ok"])

    render(
      <UhProvider>
        <OllamaHealthNotice />
      </UhProvider>,
    )

    await waitFor(() => {
      expect(screen.queryByTestId("recovery-notice-ollama-down")).not.toBeInTheDocument()
    })
  })
})
