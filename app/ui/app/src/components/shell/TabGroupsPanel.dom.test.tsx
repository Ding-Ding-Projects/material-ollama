import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UhProvider } from "@/uh";
import { TabGroupsPanel, type TabGroupsPanelMember } from "./TabGroupsPanel";
import type { TabGroupDef } from "./useShellTabs";

const GROUPS: TabGroupDef[] = [
  { id: "g-work", name: "Work", color: "#7cb342", collapsed: false },
  { id: "g-play", name: "Play", color: "#5c6bc0", collapsed: false },
];

const MEMBERS_BY_GROUP = new Map<string, TabGroupsPanelMember[]>([
  [
    "g-work",
    [
      { id: "t1", label: "Models", icon: "storefront" },
      { id: "t2", label: "Codex CLI", icon: "terminal" },
    ],
  ],
  ["g-play", [{ id: "t3", label: "Chat", icon: "forum" }]],
]);

function renderPanel(overrides: Partial<React.ComponentProps<typeof TabGroupsPanel>> = {}) {
  const handlers = {
    onClose: vi.fn(),
    onCreateGroup: vi.fn(),
    onRenameGroup: vi.fn(),
    onSetGroupColor: vi.fn(),
    onToggleCollapsed: vi.fn(),
    onDeleteGroup: vi.fn(),
    onReorderGroup: vi.fn(),
    onRemoveTabFromGroup: vi.fn(),
    onActivateTab: vi.fn(),
  };
  render(
    <UhProvider>
      <TabGroupsPanel
        open
        groups={GROUPS}
        membersByGroup={MEMBERS_BY_GROUP}
        {...handlers}
        {...overrides}
      />
    </UhProvider>,
  );
  return handlers;
}

// The "manage groups" panel hosts two of the tab system's four required
// discovery searches: filtering the groups list itself by name, and,
// independently, filtering one expanded group's own member tabs. Each has
// its own field and its own state, so typing in one must never affect the
// other.
describe("TabGroupsPanel group filtering", () => {
  it("filters the groups list by name — a non-matching group disappears entirely", async () => {
    const user = userEvent.setup();
    renderPanel();

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    // Both groups' name fields are visible before any search.
    expect(screen.getByDisplayValue("Work")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Play")).toBeInTheDocument();

    const groupSearch = screen.getByLabelText("Search groups");
    await user.type(groupSearch, "wor");

    expect(screen.getByDisplayValue("Work")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Play")).not.toBeInTheDocument();
  });

  it("filters one group's own member tabs without touching the other group's members", async () => {
    const user = userEvent.setup();
    renderPanel();

    await screen.findByRole("dialog");
    // Every member of both expanded groups starts visible.
    expect(screen.getByText("Models")).toBeInTheDocument();
    expect(screen.getByText("Codex CLI")).toBeInTheDocument();
    expect(screen.getByText("Chat")).toBeInTheDocument();

    const withinGroupSearches = screen.getAllByLabelText("Search within group");
    expect(withinGroupSearches).toHaveLength(2); // one per expanded group

    // Search only inside the first ("Work") group's own field.
    await user.type(withinGroupSearches[0], "codex");

    expect(screen.queryByText("Models")).not.toBeInTheDocument();
    expect(screen.getByText("Codex CLI")).toBeInTheDocument();
    // "Play"'s own member list is untouched by "Work"'s search field.
    expect(screen.getByText("Chat")).toBeInTheDocument();
  });

  it("collapsing a group hides its member list and search field entirely", () => {
    renderPanel({
      groups: [{ ...GROUPS[0], collapsed: true }, GROUPS[1]],
    });

    expect(screen.queryByText("Models")).not.toBeInTheDocument();
    expect(screen.queryByText("Codex CLI")).not.toBeInTheDocument();
    // The still-expanded group is unaffected.
    expect(screen.getByText("Chat")).toBeInTheDocument();

    // Only one "within group" search remains — the collapsed group's own
    // is gone along with its member list.
    expect(screen.getAllByLabelText("Search within group")).toHaveLength(1);
  });

  it("an unmatched group-name query shows no group cards at all", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole("dialog");

    const groupSearch = screen.getByLabelText("Search groups");
    await user.type(groupSearch, "xyzzy-nonexistent");

    expect(screen.queryByDisplayValue("Work")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("Play")).not.toBeInTheDocument();
  });
});
