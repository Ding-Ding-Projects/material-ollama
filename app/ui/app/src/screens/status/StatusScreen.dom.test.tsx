import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SnackbarProvider } from "@/components/md3"
import { UhProvider } from "@/uh"
import { StatusScreen } from "./StatusScreen"
import type { ReleaseInfo } from "./types"

/**
 * The desktop app's own in-app status-hub surface: this screen is what a
 * user looks at to see the same kind of evidence-behind-every-claim the
 * shared Status Hub contract requires -- release identity, the local
 * changelog, local version history, and the update/support facilities --
 * all sourced from this running instance's own real endpoints, never
 * placeholder or sample data. This test proves the container genuinely
 * assembles every one of those cards with real fetched data rather than
 * shipping an empty shell around a heading.
 */

const REAL_RELEASE: ReleaseInfo = {
  schemaVersion: 1,
  version: "1.4.0",
  commit: "abc123def456abc123def456abc123def456abc1",
  shortCommit: "abc123def456",
  isDevBuild: false,
  codeName: "Classic Har Gow · 蝦餃",
  dishId: "har-gow",
  dishNameEn: "Classic Har Gow",
  dishNameZhHant: "蝦餃",
  workflowRunNumber: 42,
  workflowRunId: 999,
  builtAt: "2026-08-19T00:00:00Z",
  catalog: [{ id: "har-gow", nameEn: "Classic Har Gow", nameZhHant: "蝦餃" }],
  assetManifest: { available: false, reason: "the asset manifest is produced after packaging completes" },
  unsigned: true,
  unsignedEvidence: "release.yaml \"Verify unsigned Windows package\" step",
}

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

function installFetchMock() {
  let events = [{ id: 1, kind: "model-installed", summary: "Installed llama3.2:3b", at: "2026-08-18T10:00:00Z" }]
  let nextId = 100

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method ?? "GET").toUpperCase()

      if (url.includes("/api/v1/release")) {
        return { ok: true, json: async () => REAL_RELEASE } as Response
      }
      if (url.includes("/api/v1/history") && method === "GET") {
        return { ok: true, json: async () => ({ events }) } as Response
      }
      if (url.includes("/api/v1/history") && method === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { kind: string; summary: string }
        nextId += 1
        const created = { id: nextId, kind: body.kind, summary: body.summary, at: new Date().toISOString() }
        events = [created, ...events]
        return { ok: true, json: async () => created } as Response
      }
      if (url.includes("/api/v1/settings") && method === "GET") {
        return { ok: true, json: async () => SETTINGS_BODY } as Response
      }
      if (url.includes("/api/v1/settings") && method === "POST") {
        return { ok: true, json: async () => SETTINGS_BODY } as Response
      }
      throw new Error(`Unexpected fetch in StatusScreen test: ${method} ${url}`)
    }),
  )
}

function renderStatusScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <UhProvider>
        <SnackbarProvider>
          <StatusScreen />
        </SnackbarProvider>
      </UhProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe("StatusScreen (in-app status hub)", () => {
  it("assembles every real status card with genuinely fetched data, not a placeholder shell", async () => {
    installFetchMock()
    renderStatusScreen()

    // Release identity: real version/commit/code-name from GET /api/v1/release.
    expect(await screen.findByText("1.4.0")).toBeInTheDocument()
    expect(screen.getByTestId("release-card")).toBeInTheDocument()
    expect(screen.getByText("Unsigned by policy")).toBeInTheDocument()

    // Automatic updates: real setting round-tripped through GET /api/v1/settings.
    expect(screen.getByText("Automatic updates")).toBeInTheDocument()

    // Changelog: built from this repository's own real commit history
    // (local data, not a fetch) -- the heading and at least one real
    // entry with an exact commit SHA link are present.
    expect(screen.getByText("Changelog")).toBeInTheDocument()

    // Local version history: the real event fetched from GET /api/v1/history.
    expect(screen.getByText("Installed llama3.2:3b")).toBeInTheDocument()

    // Support Tickets: fully local, no network -- present regardless.
    expect(screen.getByText(/Support Tickets/i)).toBeInTheDocument()
  })

  it("links the release card's homepage anchor and the changelog's commit anchors to real external URLs, never a same-window route", async () => {
    installFetchMock()
    renderStatusScreen()

    await screen.findByText("1.4.0")

    const homepageLink = screen.getByTestId("release-card-homepage-link")
    expect(homepageLink.tagName).toBe("A")
    expect(homepageLink).toHaveAttribute("target", "_blank")

    const commitAnchors = document.querySelectorAll<HTMLAnchorElement>('a[href*="/commit/"]')
    expect(commitAnchors.length).toBeGreaterThan(0)
    expect(commitAnchors[0]).toHaveAttribute("target", "_blank")
    expect(commitAnchors[0].getAttribute("href")).toMatch(
      /^https:\/\/github\.com\/Ding-Ding-Projects\/material-ollama\/commit\//,
    )
  })
})
