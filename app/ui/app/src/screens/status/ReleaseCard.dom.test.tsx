import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { UhProvider } from "@/uh"
import { ReleaseCard } from "./ReleaseCard"
import type { ReleaseInfo } from "./types"

const DEV_BUILD: ReleaseInfo = {
  schemaVersion: 1,
  version: "0.0.0",
  commit: "",
  shortCommit: "",
  isDevBuild: true,
  codeName: null,
  dishId: null,
  dishNameEn: null,
  dishNameZhHant: null,
  workflowRunNumber: null,
  workflowRunId: null,
  builtAt: null,
  catalog: [],
  assetManifest: { available: false, reason: "the asset manifest is produced after packaging completes" },
  unsigned: true,
  unsignedEvidence: "release.yaml \"Verify unsigned Windows package\" step",
}

const REAL_RELEASE: ReleaseInfo = {
  ...DEV_BUILD,
  version: "1.4.0",
  commit: "abc123def456",
  shortCommit: "abc123def456".slice(0, 12),
  isDevBuild: false,
  // Real codeName shape -- see scripts/release-metadata.mjs, which builds
  // it as `${dish.name.en} · ${dish.name.zhHant}`, never just the English
  // half alone.
  codeName: "Classic Har Gow · 蝦餃",
  dishId: "har-gow",
  dishNameEn: "Classic Har Gow",
  dishNameZhHant: "蝦餃",
  workflowRunNumber: 42,
  workflowRunId: 999,
  builtAt: "2026-08-19T00:00:00Z",
  catalog: [{ id: "har-gow", nameEn: "Classic Har Gow", nameZhHant: "蝦餃" }],
}

function renderWithFetch(payload: ReleaseInfo) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(payload),
    }),
  )
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <UhProvider>
        <ReleaseCard />
      </UhProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe("ReleaseCard", () => {
  it("shows 'Development build — no release code name' for a dev build, never a borrowed dish", async () => {
    renderWithFetch(DEV_BUILD)

    expect(
      await screen.findByText("Development build — no release code name"),
    ).toBeInTheDocument()

    // The whole point of the isDevBuild branch: nothing from a real
    // release's identity leaks in even though this component *could*
    // theoretically render a code name section.
    expect(screen.queryByText("Release code name")).not.toBeInTheDocument()
    expect(screen.queryByText(/Classic Har Gow/)).not.toBeInTheDocument()
  })

  it("shows the real version and commit facts for a dev build", async () => {
    renderWithFetch(DEV_BUILD)
    await screen.findByText("Development build — no release code name")

    expect(screen.getByText("0.0.0")).toBeInTheDocument()
  })

  it("shows the real code name and dish for a genuine release build", async () => {
    renderWithFetch(REAL_RELEASE)

    expect(await screen.findByText("Release code name")).toBeInTheDocument()
    expect(screen.getByText(/Classic Har Gow/)).toBeInTheDocument()
    expect(screen.getByText(/蝦餃/)).toBeInTheDocument()
    expect(screen.queryByText("Development build — no release code name")).not.toBeInTheDocument()
  })

  it("always states the unsigned-by-policy fact, citing the exact CI assertion", async () => {
    renderWithFetch(DEV_BUILD)
    await screen.findByText("Development build — no release code name")

    expect(screen.getByText("Unsigned by policy")).toBeInTheDocument()
    expect(
      screen.getByText("release.yaml \"Verify unsigned Windows package\" step"),
    ).toBeInTheDocument()
  })

  it("links to the repository's real GitHub homepage, as a real anchor a user can open", async () => {
    renderWithFetch(DEV_BUILD)
    await screen.findByText("Development build — no release code name")

    const link = screen.getByTestId("release-card-homepage-link")
    // The exact URL `gh repo view Ding-Ding-Projects/material-ollama
    // --json homepageUrl` reports, so this test would fail the moment the
    // link and the repository's own recorded homepage disagree.
    expect(link).toHaveAttribute("href", "https://material-ollama-day-teet-hui.halowbak123.chatgpt.site")
  })

  // Landing-page-boundary: the desktop app may LINK to the site, but must
  // never offer it as a substitute runtime -- no iframe, no embedded
  // browser view, no route that renders the site's own pages inside this
  // app's own window. A real anchor with target="_blank" hands the page
  // to the OS's own browser and leaves this window untouched; anything
  // that instead swaps this window's own content for the site's content
  // would violate that boundary.
  it("opens the site in a new tab via a real anchor, never as an embedded route inside this window", async () => {
    renderWithFetch(DEV_BUILD)
    await screen.findByText("Development build — no release code name")

    const link = screen.getByTestId("release-card-homepage-link")
    expect(link.tagName).toBe("A")
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"))

    // No iframe/webview embedding the site anywhere in the rendered card.
    expect(document.querySelector("iframe")).not.toBeInTheDocument()
    expect(document.querySelector("webview")).not.toBeInTheDocument()
  })
})
