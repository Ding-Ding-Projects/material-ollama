import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SnackbarProvider } from "@/components/md3"
import { ThemeProvider } from "@/theme/ThemeProvider"
import { UhProvider } from "@/uh"
import SettingsScreen from "./SettingsScreen"

/**
 * A real preferences document — `emoji: true` deliberately differs from
 * `DEFAULT_UI_PREFERENCES.emoji` (false) so the same fixture proves BOTH
 * halves of the provenance contract in one render: a field that differs
 * from the shipped default reads "your saved value", and a field that
 * still equals it (langMode: "en") reads "the compiled-in default".
 */
function preferencesFixture(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    langMode: "en",
    funnyEn: 2,
    funnyYue: 2,
    emoji: true,
    school: { on: false, name: "", pinSet: false },
    narration: { on: false, lang: "en", voice: "", rate: 1 },
    appearance: {
      seed: "#8a5a00",
      theme: "system",
      density: "comfortable",
      radius: 12,
      appName: "",
      glyph: "",
      overrides: {},
    },
    vocab: null,
    schedules: null,
    hardware: {},
    endpoints: { activeId: "", endpoints: [] },
    ...overrides,
  }
}

const SETTINGS_GO_FIXTURE = {
  Expose: false,
  Browser: false,
  Survey: false,
  Models: "",
  Agent: false,
  Tools: false,
  WorkingDir: "",
  ContextLength: 0,
  TurboEnabled: false,
  WebSearchEnabled: false,
  ThinkEnabled: false,
  ThinkLevel: "",
  SelectedModel: "",
  SidebarOpen: false,
  LastHomeView: "chat",
  AutoUpdateEnabled: true,
}

function jsonResponse(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }),
  )
}

function installFetchMock() {
  let currentPreferences = preferencesFixture()

  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? "GET"

    if (url.includes("/api/v1/uh/preferences")) {
      if (method === "PATCH") {
        const patch = init?.body ? JSON.parse(String(init.body)) : {}
        currentPreferences = { ...currentPreferences, ...patch }
        return jsonResponse({ preferences: currentPreferences })
      }
      return jsonResponse({ preferences: currentPreferences })
    }
    if (url.includes("/api/v1/settings")) {
      return jsonResponse({ settings: SETTINGS_GO_FIXTURE })
    }
    if (url.includes("/api/v1/inference-compute")) {
      return jsonResponse({ defaultContextLength: 4096 })
    }
    return jsonResponse({})
  })

  vi.stubGlobal("fetch", fetchMock)
  return { fetchMock, getPreferences: () => currentPreferences }
}

function renderSettingsScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <UhProvider>
        <ThemeProvider>
          <SnackbarProvider>
            <SettingsScreen />
          </SnackbarProvider>
        </ThemeProvider>
      </UhProvider>
    </QueryClientProvider>,
  )
}

describe("SettingsScreen", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** The row containing a given title span: the same "min-w-0 flex-1"
   * container `SettingRow` renders the title, explanation and provenance
   * line into (see `SettingRow.tsx`) — scoping to this, rather than the
   * whole card, is what lets a query for one row's text never collide
   * with a sibling row that happens to render identical wording (e.g. two
   * rows that both default to "en"). */
  function rowFor(titleText: string): HTMLElement {
    const titleSpan = screen.getByText(titleText, { selector: "span" })
    const row = titleSpan.parentElement?.parentElement
    if (!row) throw new Error(`could not find the SettingRow container for "${titleText}"`)
    return row as HTMLElement
  }

  it("reaches the live theme when a seed colour swatch is picked", async () => {
    installFetchMock()
    const user = userEvent.setup()
    renderSettingsScreen()

    // findByRole retries until preferences actually resolve and the row
    // leaves its "Saving…" disabled state — waiting on the card heading
    // instead would resolve on the very first (still-loading) render.
    const blueSwatch = await screen.findByRole("button", { name: /use this seed colour — #1a73e8/i })

    const before = document.documentElement.style.getPropertyValue("--p")

    await user.click(blueSwatch)

    await waitFor(() => {
      const after = document.documentElement.style.getPropertyValue("--p")
      expect(after).not.toBe(before)
      expect(after.length).toBeGreaterThan(0)
    })
  })

  it("filters the six cards as the user searches", async () => {
    installFetchMock()
    const user = userEvent.setup()
    renderSettingsScreen()

    expect(await screen.findByRole("heading", { name: "General" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "School mode" })).toBeInTheDocument()

    const search = screen.getByLabelText("Search settings")
    await user.type(search, "School")

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "School mode" })).toBeInTheDocument()
      expect(screen.queryByRole("heading", { name: "General" })).not.toBeInTheDocument()
      expect(screen.queryByRole("heading", { name: "Appearance" })).not.toBeInTheDocument()
    })
  })

  it("shows the no-matches state for a query nothing satisfies", async () => {
    installFetchMock()
    const user = userEvent.setup()
    renderSettingsScreen()

    await screen.findByRole("heading", { name: "Appearance" })
    const search = screen.getByLabelText("Search settings")
    await user.type(search, "xyzzy-nonexistent-setting")

    await waitFor(() => {
      expect(screen.getByText("No settings match that search.")).toBeInTheDocument()
    })
  })

  it("distinguishes a stored value from the compiled-in default in the same render", async () => {
    installFetchMock()
    renderSettingsScreen()

    // emoji: true in the fixture differs from DEFAULT_UI_PREFERENCES.emoji
    // (false) -- its row must read "stored", not "default". Wait on the
    // row itself (findByRole above already proved loading finishes), then
    // read its own provenance line.
    await screen.findByRole("heading", { name: "General" })
    await waitFor(() => {
      const emojiRow = rowFor("Show emojis in dialogs")
      expect(within(emojiRow).getByText(/currently your saved value: on/i)).toBeInTheDocument()
    })

    // langMode: "en" in the fixture equals the compiled-in default -- its
    // OWN row (not the sibling narrator-language row, which can render the
    // identical "…default: en" text) must read "default", not "stored".
    const langModeRow = rowFor("Language mode")
    expect(within(langModeRow).getByText(/currently the compiled-in default: en/i)).toBeInTheDocument()
    expect(within(langModeRow).queryByText(/currently your saved value/i)).not.toBeInTheDocument()
  })
})
