import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PREFERENCES_STORAGE_KEY, UhProvider } from "@/uh";
import { DimSumCatalogCard } from "./DimSumCatalogCard";
import type { ReleaseInfo } from "./types";

// "Hidden entirely (not disabled) under School mode, per the 'dimsum'
// feature family useShows() covers -- names, code names and every
// dim-sum reference are part of that family, not just the surprise
// toast." This exercises exactly that School-mode gate plus the real
// build-embedded catalog rendering, through the actual useReleaseInfo()
// query rather than an injected prop.
const RELEASE: ReleaseInfo = {
  schemaVersion: 1,
  version: "1.4.0",
  commit: "abc123def456",
  shortCommit: "abc123def456",
  isDevBuild: false,
  codeName: "Classic Har Gow · 蝦餃",
  dishId: "har-gow",
  dishNameEn: "Classic Har Gow",
  dishNameZhHant: "蝦餃",
  workflowRunNumber: 42,
  workflowRunId: 999,
  builtAt: "2026-08-19T00:00:00Z",
  catalog: [
    { id: "har-gow", nameEn: "Classic Har Gow", nameZhHant: "蝦餃" },
    { id: "cheung-fun", nameEn: "Rice Noodle Roll", nameZhHant: "腸粉" },
  ],
  assetManifest: { available: true, reason: null },
  unsigned: true,
  unsignedEvidence: "release.yaml \"Verify unsigned Windows package\" step",
};

function setSchoolOn() {
  window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ school: { on: true } }));
}

function renderCard(release: ReleaseInfo = RELEASE) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(release) }),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <UhProvider>
        <DimSumCatalogCard />
      </UhProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("DimSumCatalogCard", () => {
  it("lists the real build-embedded catalog dishes with both English and Cantonese names", async () => {
    renderCard();

    expect(await screen.findByTestId("dimsum-catalog-card")).toBeInTheDocument();
    expect(screen.getByText(/Classic Har Gow/)).toBeInTheDocument();
    expect(screen.getByText(/蝦餃/)).toBeInTheDocument();
    expect(screen.getByText(/Rice Noodle Roll/)).toBeInTheDocument();
  });

  it("renders nothing at all while School mode is on, rather than disabling the card", async () => {
    setSchoolOn();
    const { container } = renderCard();

    // Give the release query a chance to resolve; the card must still not
    // render even once real data is available, because the School gate is
    // checked before the data-driven branches.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByTestId("dimsum-catalog-card")).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing while the release query has not resolved yet, rather than a loading placeholder", () => {
    renderCard();
    expect(screen.queryByTestId("dimsum-catalog-card")).not.toBeInTheDocument();
  });
});
