import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SnackbarProvider } from "@/components/md3"
import { UhProvider } from "@/uh"
import { AutomaticUpdatesCard } from "./AutomaticUpdatesCard"
import type { UpdateStatus } from "./types"
import { StreamingProvider, useStreamingContext } from "@/contexts/StreamingContext"
import { setComposerUnsavedWork } from "@/lib/unsavedWork"
import { useLayoutEffect } from "react"

function ActiveResponse() {
  const { setStreamingChatIds } = useStreamingContext()
  useLayoutEffect(() => { setStreamingChatIds(new Set(["active-chat"])) }, [setStreamingChatIds])
  return null
}

function setup(initial: Partial<UpdateStatus> = {}) {
  let state: UpdateStatus = {
    state: "idle", unsignedWarning: true, canRestart: false, canLater: false,
    generation: 0, updatedAt: "2026-09-04T00:00:00Z", ...initial,
  }
  const requests: { path: string; body: unknown }[] = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)
    if (path.endsWith("/api/v1/settings")) return Response.json({ settings: { AutoUpdateEnabled: true } })
    if (init?.method === "POST") {
      requests.push({ path, body: init.body ? JSON.parse(String(init.body)) : undefined })
      if (path.endsWith("/check")) state = { ...state, state: "checking" }
      if (path.endsWith("/download")) state = { ...state, state: "downloading" }
      if (path.endsWith("/cancel")) state = { ...state, state: "cancelled" }
      if (path.endsWith("/later")) state = { ...state, state: "deferred" }
      if (path.endsWith("/restart")) state = { ...state, state: "restarting" }
    }
    return Response.json(state)
  })
  vi.stubGlobal("fetch", fetchMock)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const mount = (active = false) => render(<QueryClientProvider client={client}><UhProvider><SnackbarProvider><StreamingProvider>{active ? <ActiveResponse /> : null}<AutomaticUpdatesCard /></StreamingProvider></SnackbarProvider></UhProvider></QueryClientProvider>)
  return { mount, requests, fetchMock, setState: (next: Partial<UpdateStatus>) => { state = { ...state, ...next } } }
}

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe("persistent update flow", () => {
  it("loads a staged update without checking and sends explicit restart consent", async () => {
    const flow = setup({ state: "ready-to-restart", version: "1.2.3", canRestart: true, canLater: true, releaseNotesUrl: "https://example.com/releases/1.2.3" })
    flow.mount()
    expect(await screen.findByText(/Ready to restart · 1.2.3/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "View release notes" })).toHaveAttribute("href", "https://example.com/releases/1.2.3")
    expect(screen.getByText("This update is intentionally unsigned.")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Restart to install update" }))
    expect(flow.requests).toEqual([{ path: expect.stringContaining("/update/restart"), body: { confirmed: true, unsavedWork: false } }])
  })

  it("polls through checking and downloading and allows cancellation", async () => {
    const flow = setup()
    flow.mount()
    await userEvent.click(await screen.findByRole("button", { name: "Check for updates" }))
    await screen.findByText(/Update state: Checking for updates/)
    flow.setState({ state: "available", version: "1.2.3" })
    const download = await screen.findByRole("button", { name: "Download update" }, { timeout: 2500 })
    await userEvent.click(download)
    const cancel = await screen.findByRole("button", { name: "Cancel update" })
    await waitFor(() => expect(cancel).toBeEnabled())
    await userEvent.click(cancel)
    expect(await screen.findByText(/Update state: Update cancelled/)).toBeInTheDocument()
    expect(flow.requests.filter((request) => request.path.endsWith("/cancel"))).toHaveLength(1)
  })

  it("keeps a deferred update available and reports byte progress", async () => {
    const flow = setup({ state: "downloading", bytesDownloaded: 200, bytesTotal: 1000, rateBytesPerSecond: 100, etaSeconds: 8 })
    const mounted = flow.mount()
    expect(await screen.findByText("200 of 1000 bytes · 100 bytes/s · 8 seconds remaining")).toBeInTheDocument()
    mounted.unmount()
    flow.setState({ state: "deferred", canRestart: true, version: "1.2.3" })
    flow.mount()
    expect(await screen.findByRole("button", { name: "Restart to install update" })).toBeEnabled()
  })

  it("does not expose an arbitrary backend diagnostic or unsafe notes URL", async () => {
    const flow = setup({ state: "error", error: "sensitive server detail", errorCode: "unknown", releaseNotesUrl: "javascript:alert(1)" })
    flow.mount()
    await screen.findByTestId("update-status")
    expect(screen.queryByText("sensitive server detail")).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "View release notes" })).not.toBeInTheDocument()
  })

  it("blocks restart while a genuine composer occupancy notification is present", async () => {
    const owner = Symbol("test composer")
    setComposerUnsavedWork(owner, true)
    try {
      const flow = setup({ state: "ready-to-restart", canRestart: true })
      flow.mount()
      const restart = await screen.findByRole("button", { name: "Restart to install update" })
      expect(restart).toBeDisabled()
      await userEvent.click(restart)
      expect(flow.requests).toHaveLength(0)
      setComposerUnsavedWork(owner, false)
      await waitFor(() => expect(restart).toBeEnabled())
    } finally { setComposerUnsavedWork(owner, false) }
  })

  it("blocks restart while any chat response is still active", async () => {
    const flow = setup({ state: "ready-to-restart", canRestart: true })
    flow.mount(true)
    expect(await screen.findByRole("button", { name: "Restart to install update" })).toBeDisabled()
    expect(flow.requests).toHaveLength(0)
  })
})
