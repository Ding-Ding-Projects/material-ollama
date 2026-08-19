import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { UhProvider } from "@/uh"
import { CatalogRecoveryNotice } from "./CatalogRecoveryNotice"

const UNAVAILABLE_STATUS = {
  refreshing: false,
  cachedVariants: 0,
  verdict: "unavailable",
  reason: "no catalog has been fetched yet",
}

const COMPLETE_STATUS = {
  refreshing: false,
  cachedVariants: 40,
  verdict: "complete",
  reason: "names and tags were both enumerated from the registry's own catalog and tags/list API",
}

function installCatalogFetchMock(opts: { statusSequence: object[]; refreshOk?: boolean }) {
  let statusCall = 0
  const calls: Array<{ url: string; method: string }> = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method ?? "GET").toUpperCase()
    calls.push({ url, method })
    if (url.includes("/api/v1/models/catalog/refresh") && method === "POST") {
      if (opts.refreshOk === false) {
        return { ok: false, status: 500, text: async () => "refresh failed" } as Response
      }
      return { ok: true, json: async () => ({ refreshing: true, refreshStartedAt: "now" }) } as Response
    }
    if (url.includes("/api/v1/models/catalog/status")) {
      const body = opts.statusSequence[Math.min(statusCall, opts.statusSequence.length - 1)]
      statusCall += 1
      return { ok: true, json: async () => body } as Response
    }
    throw new Error(`Unexpected fetch in test: ${method} ${url}`)
  })
  vi.stubGlobal("fetch", fetchMock)
  return { fetchMock, calls }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("CatalogRecoveryNotice", () => {
  it("renders the server's own reason for a never-fetched catalog and offers a real Refresh catalog action", async () => {
    const user = userEvent.setup()
    const { calls } = installCatalogFetchMock({ statusSequence: [UNAVAILABLE_STATUS, COMPLETE_STATUS] })

    render(
      <UhProvider>
        <CatalogRecoveryNotice />
      </UhProvider>,
    )

    const notice = await screen.findByTestId("recovery-notice-catalog-unavailable")
    expect(notice).toHaveTextContent("no catalog has been fetched yet")

    await user.click(screen.getByRole("button", { name: "Refresh catalog" }))

    await waitFor(() => {
      expect(calls.some((c) => c.url.includes("/catalog/refresh") && c.method === "POST")).toBe(true)
    })
    // Refresh re-polls status afterward -- proving this is a real POST
    // plus a real re-check, not a button that only flips local state.
    await waitFor(() => {
      expect(calls.filter((c) => c.url.includes("/catalog/status")).length).toBeGreaterThanOrEqual(2)
    })

    await waitFor(() => {
      expect(screen.queryByTestId("recovery-notice-catalog-unavailable")).not.toBeInTheDocument()
    })
  })

  it("stays silent once the catalog verdict is complete", async () => {
    installCatalogFetchMock({ statusSequence: [COMPLETE_STATUS] })

    render(
      <UhProvider>
        <CatalogRecoveryNotice />
      </UhProvider>,
    )

    await waitFor(() => {
      expect(screen.queryByTestId(/^recovery-notice-catalog-/)).not.toBeInTheDocument()
    })
  })
})
