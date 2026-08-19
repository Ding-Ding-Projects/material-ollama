import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TabStrip, type TabStripTab } from "./TabStrip";

const TABS: TabStripTab[] = [
  { id: "a", label: "Models", icon: "storefront" },
  { id: "b", label: "Chat", icon: "forum" },
  { id: "c", label: "Launch", icon: "rocket_launch" },
];

function renderStrip(dock: "left" | "right" | "top" | "bottom", activeId = "b") {
  const onActivate = vi.fn();
  render(
    <TabStrip
      tabs={TABS}
      activeId={activeId}
      dock={dock}
      onActivate={onActivate}
      onClose={vi.fn()}
      overflowLabel="Search open tabs"
    />,
  );
  return { onActivate };
}

// Docking is an orientation change, never a rotation: a side dock sets
// aria-orientation="vertical" and moves selection with Up/Down, while a
// top/bottom dock stays "horizontal" and moves with Left/Right. Getting the
// axis wrong produces a strip that *looks* right and is unusable by
// keyboard — exactly the failure mode a screenshot can't catch, which is
// why this is asserted directly rather than only visually.
describe("TabStrip docking orientation and arrow-key direction", () => {
  it.each([
    ["left", "vertical"],
    ["right", "vertical"],
    ["top", "horizontal"],
    ["bottom", "horizontal"],
  ] as const)("dock=%s renders aria-orientation=%s", (dock, orientation) => {
    renderStrip(dock);
    expect(screen.getByRole("tablist")).toHaveAttribute("aria-orientation", orientation);
  });

  it("left dock (vertical): ArrowDown/ArrowUp move the active tab, ArrowLeft/ArrowRight do nothing", () => {
    const { onActivate } = renderStrip("left", "b");
    const activeTab = screen.getByRole("tab", { name: /chat/i });

    fireEvent.keyDown(activeTab, { key: "ArrowDown" });
    expect(onActivate).toHaveBeenLastCalledWith("c");

    onActivate.mockClear();
    fireEvent.keyDown(activeTab, { key: "ArrowUp" });
    expect(onActivate).toHaveBeenLastCalledWith("a");

    onActivate.mockClear();
    fireEvent.keyDown(activeTab, { key: "ArrowRight" });
    fireEvent.keyDown(activeTab, { key: "ArrowLeft" });
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("top dock (horizontal): ArrowRight/ArrowLeft move the active tab, ArrowUp/ArrowDown do nothing", () => {
    const { onActivate } = renderStrip("top", "b");
    const activeTab = screen.getByRole("tab", { name: /chat/i });

    fireEvent.keyDown(activeTab, { key: "ArrowRight" });
    expect(onActivate).toHaveBeenLastCalledWith("c");

    onActivate.mockClear();
    fireEvent.keyDown(activeTab, { key: "ArrowLeft" });
    expect(onActivate).toHaveBeenLastCalledWith("a");

    onActivate.mockClear();
    fireEvent.keyDown(activeTab, { key: "ArrowUp" });
    fireEvent.keyDown(activeTab, { key: "ArrowDown" });
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("right dock also moves with Up/Down (mirrors left, not top)", () => {
    const { onActivate } = renderStrip("right", "a");
    const activeTab = screen.getByRole("tab", { name: /models/i });
    fireEvent.keyDown(activeTab, { key: "ArrowDown" });
    expect(onActivate).toHaveBeenLastCalledWith("b");
  });

  it("bottom dock also moves with Left/Right (mirrors top, not left)", () => {
    const { onActivate } = renderStrip("bottom", "a");
    const activeTab = screen.getByRole("tab", { name: /models/i });
    fireEvent.keyDown(activeTab, { key: "ArrowRight" });
    expect(onActivate).toHaveBeenLastCalledWith("b");
  });

  it("Home/End jump to the first/last tab regardless of orientation", () => {
    const { onActivate } = renderStrip("left", "b");
    const activeTab = screen.getByRole("tab", { name: /chat/i });
    fireEvent.keyDown(activeTab, { key: "End" });
    expect(onActivate).toHaveBeenLastCalledWith("c");
    onActivate.mockClear();
    fireEvent.keyDown(activeTab, { key: "Home" });
    expect(onActivate).toHaveBeenLastCalledWith("a");
  });

  it("wraps around at the ends of the strip", () => {
    const { onActivate } = renderStrip("top", "c");
    const activeTab = screen.getByRole("tab", { name: /launch/i });
    fireEvent.keyDown(activeTab, { key: "ArrowRight" });
    expect(onActivate).toHaveBeenLastCalledWith("a");
  });
});

describe("TabStrip groups", () => {
  const groups = [{ id: "g1", name: "Work", color: "#7cb342", collapsed: false }];
  const groupedTabs: TabStripTab[] = [
    { id: "a", label: "Models", icon: "storefront" },
    { id: "b", label: "Chat", icon: "forum", groupId: "g1" },
    { id: "c", label: "Launch", icon: "rocket_launch", groupId: "g1" },
  ];

  it("renders every group member as a real tab when expanded", () => {
    render(
      <TabStrip
        tabs={groupedTabs}
        groups={groups}
        activeId="a"
        dock="top"
        onActivate={vi.fn()}
        onClose={vi.fn()}
        overflowLabel="Search open tabs"
      />,
    );
    expect(screen.getByRole("tab", { name: /chat/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /launch/i })).toBeInTheDocument();
  });

  it("collapsing a group hides its member tabs and shows one summary chip instead", () => {
    const onToggleGroupCollapsed = vi.fn();
    render(
      <TabStrip
        tabs={groupedTabs}
        groups={[{ ...groups[0], collapsed: true }]}
        activeId="a"
        dock="top"
        onActivate={vi.fn()}
        onClose={vi.fn()}
        onToggleGroupCollapsed={onToggleGroupCollapsed}
        overflowLabel="Search open tabs"
      />,
    );
    expect(screen.queryByRole("tab", { name: /chat/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /launch/i })).not.toBeInTheDocument();
    const chip = screen.getByRole("button", { name: /expand work \(2\)/i });
    expect(chip).toBeInTheDocument();
    fireEvent.click(chip);
    expect(onToggleGroupCollapsed).toHaveBeenCalledWith("g1");
  });
});
