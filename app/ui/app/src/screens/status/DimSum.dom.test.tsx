import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PREFERENCES_STORAGE_KEY, UhProvider } from "@/uh"
import { DimSumCatalogCard } from "./DimSumCatalogCard"
import { DimSumSurpriseCard } from "./DimSumSurpriseCard"
import type { ReleaseInfo } from "./types"

const BASE: ReleaseInfo = {
  schemaVersion: 1,
  version: "1.0.0",
  commit: "deadbeef",
  shortCommit: "deadbeef",
  isDevBuild: false,
  codeName: "Classic Har Gow · 蝦餃",
  dishId: "har-gow",
  dishNameEn: "Classic Har Gow",
  dishNameZhHant: "蝦餃",
  workflowRunNumber: 1,
  workflowRunId: 1,
  builtAt: "2026-08-19T00:00:00Z",
  catalog: [
    { id: "har-gow", nameEn: "Classic Har Gow", nameZhHant: "蝦餃" },
    { id: "siu-mai", nameEn: "Siu Mai", nameZhHant: "燒賣" },
  ],
  assetManifest: { available: false, reason: "not available offline" },
  unsigned: true,
  unsignedEvidence: "release.yaml",
}

function mockRelease(payload: ReleaseInfo) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) }),
  )
}

function renderWith(children: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <UhProvider>{children}</UhProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe("DimSumCatalogCard", () => {
  it("lists the real, embedded catalog dishes", async () => {
    mockRelease(BASE)
    renderWith(<DimSumCatalogCard />)

    expect(await screen.findByText("Release dim sum catalog")).toBeInTheDocument()
    expect(screen.getByText(/Classic Har Gow/)).toBeInTheDocument()
    expect(screen.getByText(/Siu Mai/)).toBeInTheDocument()
    expect(screen.getByText(/2 dishes in this build's snapshot/)).toBeInTheDocument()
  })

  it("shows an honest empty state for a development build with no catalog snapshot", async () => {
    mockRelease({ ...BASE, catalog: [], isDevBuild: true, codeName: null })
    renderWith(<DimSumCatalogCard />)

    expect(await screen.findByText("Release dim sum catalog")).toBeInTheDocument()
    expect(
      screen.getByText(/No catalog snapshot is embedded in this build/),
    ).toBeInTheDocument()
  })

  it("is hidden entirely (not disabled) under School mode", async () => {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ school: { on: true } }))
    mockRelease(BASE)
    const { container } = renderWith(<DimSumCatalogCard />)

    // Give the release query a tick to resolve so a real render pass has
    // happened -- if School mode merely *disabled* the card there would
    // be a disabled control here; hidden means nothing at all.
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(screen.queryByText("Release dim sum catalog")).not.toBeInTheDocument()
    expect(container).toBeEmptyDOMElement()
  })
})

describe("DimSumSurpriseCard", () => {
  it("renders a real dish from the embedded catalog when the roll hits", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0)
    mockRelease(BASE)
    renderWith(<DimSumSurpriseCard />)

    expect(await screen.findByTestId("dimsum-surprise-card")).toBeInTheDocument()
    expect(screen.getByText(/Classic Har Gow/)).toBeInTheDocument()
    expect(screen.getByText(/蝦餃/)).toBeInTheDocument()
  })

  it("renders nothing at all (not a 'no surprise' placeholder) when the roll misses", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99)
    mockRelease(BASE)
    const { container } = renderWith(<DimSumSurpriseCard />)

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(container).toBeEmptyDOMElement()
  })

  it("is hidden entirely under School mode even when the roll would have hit", async () => {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ school: { on: true } }))
    vi.spyOn(Math, "random").mockReturnValue(0)
    mockRelease(BASE)
    const { container } = renderWith(<DimSumSurpriseCard />)

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(container).toBeEmptyDOMElement()
  })
})
