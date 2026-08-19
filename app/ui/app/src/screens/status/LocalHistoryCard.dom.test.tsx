import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SnackbarProvider } from "@/components/md3"
import { UhProvider } from "@/uh"
import { LocalHistoryCard } from "./LocalHistoryCard"
import type { AppEvent } from "./types"

const SETTINGS_BODY = {
  settings: {
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
    AutoUpdateEnabled: true,
  },
}

function makeEvent(id: number, kind: string, summary: string, at: string): AppEvent {
  return { id, kind, summary, at }
}

let events: AppEvent[] = []
let nextId = 100

function installFetchMock() {
  events = [
    makeEvent(1, "model-installed", "Installed llama3.2:3b", "2026-08-18T10:00:00Z"),
    makeEvent(2, "model-deleted", "Removed an old quant", "2026-08-19T09:30:00Z"),
  ]
  nextId = 100

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method ?? "GET").toUpperCase()

      if (url.includes("/api/v1/history") && method === "GET") {
        return { ok: true, json: async () => ({ events }) } as Response
      }
      if (url.includes("/api/v1/history") && method === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { kind: string; summary: string }
        nextId += 1
        const created = makeEvent(nextId, body.kind, body.summary, new Date().toISOString())
        events = [created, ...events]
        return { ok: true, json: async () => created } as Response
      }
      if (url.includes("/api/v1/settings") && method === "GET") {
        return { ok: true, json: async () => SETTINGS_BODY } as Response
      }
      throw new Error(`Unexpected fetch in test: ${method} ${url}`)
    }),
  )
}

function renderCard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <UhProvider>
        <SnackbarProvider>
          <LocalHistoryCard />
        </SnackbarProvider>
      </UhProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("LocalHistoryCard", () => {
  it("lists real events from GET /api/v1/history", async () => {
    installFetchMock()
    renderCard()

    expect(await screen.findByText("Installed llama3.2:3b")).toBeInTheDocument()
    expect(screen.getByText("Removed an old quant")).toBeInTheDocument()
    expect(screen.getByText(/2 of 2 events/)).toBeInTheDocument()
  })

  it("derives the action filter from the real events, not a hard-coded list", async () => {
    installFetchMock()
    renderCard()
    await screen.findByText("Installed llama3.2:3b")

    const select = screen.getByLabelText("Filter by action") as HTMLSelectElement
    const optionLabels = within(select)
      .getAllByRole("option")
      .map((option) => option.textContent)

    expect(optionLabels).toEqual(["All actions", "model-deleted", "model-installed"])
  })

  it("filters the list down when a specific action is selected", async () => {
    const user = userEvent.setup()
    installFetchMock()
    renderCard()
    await screen.findByText("Installed llama3.2:3b")

    await user.selectOptions(screen.getByLabelText("Filter by action"), "model-deleted")

    expect(screen.getByText("Removed an old quant")).toBeInTheDocument()
    expect(screen.queryByText("Installed llama3.2:3b")).not.toBeInTheDocument()
    expect(screen.getByText(/1 of 2 events/)).toBeInTheDocument()
  })

  it("records a new checkpoint through POST /api/v1/history and shows it in the list", async () => {
    const user = userEvent.setup()
    installFetchMock()
    renderCard()
    await screen.findByText("Installed llama3.2:3b")

    await user.type(screen.getByLabelText("Record a checkpoint"), "Manually verified the changelog card")
    await user.click(screen.getByRole("button", { name: "Record" }))

    expect(await screen.findByText("Manually verified the changelog card")).toBeInTheDocument()
    expect(screen.getByText(/3 of 3 events/)).toBeInTheDocument()
    // The input clears after a successful record.
    await waitFor(() =>
      expect((screen.getByLabelText("Record a checkpoint") as HTMLInputElement).value).toBe(""),
    )
  })

  it("shows the real empty state when there is no history yet", async () => {
    installFetchMock()
    events = []
    renderCard()

    expect(await screen.findByText("No local history recorded yet.")).toBeInTheDocument()
  })
})
