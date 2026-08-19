import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SnackbarProvider } from "@/components/md3"
import { UhProvider } from "@/uh"
import { PullRecoveryNotice } from "./PullRecoveryNotice"
import { usePullRecovery } from "./usePullRecovery"

// A real caller: a button that queues a pull, exactly the shape
// ModelsScreen wires usePullRecovery's `pull`/`pulling` into
// CatalogSection's onPull/pulling props, with the notice rendered
// alongside it.
function PullHarness() {
  const recovery = usePullRecovery()
  return (
    <div>
      <button type="button" onClick={() => recovery.pull("llama3.3:70b")}>
        Pull
      </button>
      <PullRecoveryNotice
        error={recovery.error}
        diskLow={recovery.diskLow}
        retrying={recovery.pulling}
        onRetry={recovery.retry}
      />
    </div>
  )
}

function installPullFetchMock(responses: Array<{ ok: boolean; body: unknown }>) {
  let i = 0
  const calls: Array<{ url: string; method: string; body: unknown }> = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method ?? "GET").toUpperCase()
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (!url.includes("/api/v1/models/pull")) {
      throw new Error(`Unexpected fetch in test: ${method} ${url}`)
    }
    const resp = responses[Math.min(i, responses.length - 1)]
    i += 1
    if (!resp.ok) {
      return { ok: false, status: 400, clone: () => ({ json: async () => resp.body }), json: async () => resp.body, text: async () => JSON.stringify(resp.body) } as unknown as Response
    }
    return { ok: true, json: async () => resp.body } as Response
  })
  vi.stubGlobal("fetch", fetchMock)
  return { fetchMock, calls }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

// This is the models.go pullEnqueue disk-space floor's exact real message
// shape ("needs at least %s free; only %s free on %s") -- the RecoveryNotice
// must show it verbatim, not a re-derived guess about how much space is free.
const DISK_ERROR = { error: "needs at least 512.0 MB free; only 88.4 MB free on C:\\Users\\me\\.ollama\\models" }

describe("PullRecoveryNotice / usePullRecovery", () => {
  it("shows the real disk-preflight refusal verbatim and Retry re-issues the same pull", async () => {
    const user = userEvent.setup()
    const { fetchMock, calls } = installPullFetchMock([
      { ok: false, body: DISK_ERROR },
      { ok: true, body: { id: "abc", model: "llama3.3:70b", state: "queued" } },
    ])

    render(
      <UhProvider>
        <SnackbarProvider>
          <PullHarness />
        </SnackbarProvider>
      </UhProvider>,
    )

    await user.click(screen.getByRole("button", { name: "Pull" }))

    const notice = await screen.findByTestId("recovery-notice-pull-disk-low")
    expect(notice).toHaveTextContent(
      "needs at least 512.0 MB free; only 88.4 MB free on C:\\Users\\me\\.ollama\\models",
    )
    expect(notice).toHaveTextContent("Not enough disk space to queue this pull")

    await user.click(screen.getByRole("button", { name: "Retry" }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    // Same model, re-sent -- a real retry of the exact same request.
    expect(calls[1].body).toEqual({ model: "llama3.3:70b" })

    await waitFor(() => {
      expect(screen.queryByTestId("recovery-notice-pull-disk-low")).not.toBeInTheDocument()
    })
  })

  it("frames a non-disk refusal with the generic pull-failed copy instead", async () => {
    const user = userEvent.setup()
    installPullFetchMock([{ ok: false, body: { error: "model reference is invalid" } }])

    render(
      <UhProvider>
        <SnackbarProvider>
          <PullHarness />
        </SnackbarProvider>
      </UhProvider>,
    )

    await user.click(screen.getByRole("button", { name: "Pull" }))

    const notice = await screen.findByTestId("recovery-notice-pull-failed")
    expect(notice).toHaveTextContent("model reference is invalid")
    expect(notice).toHaveTextContent("Couldn't queue this pull")
  })
})
