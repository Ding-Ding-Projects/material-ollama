import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SnackbarProvider } from "@/components/md3"
import { UhProvider } from "@/uh"
import { AutomaticUpdatesCard } from "./AutomaticUpdatesCard"
import { StreamingProvider } from "@/contexts/StreamingContext"

const SETTINGS = {
  Expose: false,
  Browser: false,
  Survey: false,
  Models: "",
  Agent: false,
  Tools: false,
  WorkingDir: "",
  ContextLength: 4096,
  TurboEnabled: false,
  WebSearchEnabled: false,
  ThinkEnabled: false,
  ThinkLevel: "",
  SelectedModel: "",
  SidebarOpen: false,
  LastHomeView: "",
  AutoUpdateEnabled: false,
}

function installFetchMock() {
  const state = { ...SETTINGS }
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method ?? "GET").toUpperCase()
      if (url.endsWith("/api/v1/update")) return Response.json({ state: "idle", unsignedWarning: true, canRestart: false, canLater: false, generation: 0, updatedAt: "2026-09-04T00:00:00Z" })
      if (url.includes("/api/v1/settings") && method === "GET") {
        return { ok: true, json: async () => ({ settings: state }) } as Response
      }
      if (url.includes("/api/v1/settings") && method === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as typeof SETTINGS
        Object.assign(state, body)
        return { ok: true, json: async () => ({ settings: state }) } as Response
      }
      throw new Error(`Unexpected fetch in test: ${method} ${url}`)
    }),
  )
  return state
}

function renderCard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <UhProvider>
        <SnackbarProvider>
          <StreamingProvider><AutomaticUpdatesCard /></StreamingProvider>
        </SnackbarProvider>
      </UhProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("AutomaticUpdatesCard", () => {
  it("reflects the real AutoUpdateEnabled setting and can toggle it", async () => {
    const user = userEvent.setup()
    const state = installFetchMock()
    renderCard()

    const toggle = await screen.findByRole("switch", { name: "Check for updates automatically" })
    expect(toggle).toHaveAttribute("aria-checked", "false")

    await user.click(toggle)

    await screen.findByText("Automatic-update preference saved.")
    expect(state.AutoUpdateEnabled).toBe(true)
  })

  it("always states that updates are unsigned too", async () => {
    installFetchMock()
    renderCard()

    expect(
      await screen.findByText(/Every downloaded update package is unsigned too/),
    ).toBeInTheDocument()
  })
})
