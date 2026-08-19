import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UhProvider } from "@/uh";
import type { DocsFeature } from "@/api";
import { DocsDrawer } from "./DocsDrawer";

// The offline documentation browser's 300px feature list: an A-Z grouped,
// plain/regex-searchable list where each row shows a real written/scaffold
// status rather than just a name -- exactly what the docs.png capture used
// elsewhere in this inventory shows ("Not written" beside every
// not-yet-authored article).
const FEATURES: DocsFeature[] = [
  { id: "accessibility", title: "Accessibility", written: false },
  { id: "app-display-name", title: "App Display Name", written: false },
  { id: "browser-tabs", title: "Browser Tabs", written: true },
];

function Harness({ initialQuery = "" }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [regexMode, setRegexMode] = useState(false);
  const onSelect = vi.fn();
  return (
    <DocsDrawer
      features={FEATURES}
      selectedId={null}
      onSelect={onSelect}
      query={query}
      onQueryChange={setQuery}
      regexMode={regexMode}
      onToggleRegex={() => setRegexMode((c: boolean) => !c)}
    />
  );
}

function renderDrawer() {
  render(
    <UhProvider>
      <Harness />
    </UhProvider>,
  );
}

describe("DocsDrawer", () => {
  it("shows the real written/not-written badge for each feature", () => {
    renderDrawer();

    expect(screen.getAllByText("Not written")).toHaveLength(2);
    expect(screen.getAllByText("Written")).toHaveLength(1);
  });

  it("filters the list to matches of the typed query and updates the match count", async () => {
    const user = userEvent.setup();
    renderDrawer();

    expect(screen.getByText("3 of 85 features")).toBeInTheDocument();

    const search = screen.getByLabelText("Search documentation articles");
    await user.type(search, "browser");

    expect(screen.getByText("Browser Tabs")).toBeInTheDocument();
    expect(screen.queryByText("Accessibility")).not.toBeInTheDocument();
    expect(screen.getByText("1 of 85 features")).toBeInTheDocument();
  });

  it("shows the honest no-matches state instead of an empty list for a query nothing satisfies", async () => {
    const user = userEvent.setup();
    renderDrawer();

    const search = screen.getByLabelText("Search documentation articles");
    await user.type(search, "xyzzy-nonexistent-feature");

    expect(screen.getByText("No features match this search.")).toBeInTheDocument();
    expect(screen.queryByText("Accessibility")).not.toBeInTheDocument();
  });
});
