import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UhProvider } from "@/uh";
import { CommandPalette } from "./CommandPalette";

// Ctrl+Shift+F's destination — teleports to any of the nine screens by
// typed text. Wrapped in the real UhProvider (not relying on the default
// context value) so this exercises the same localization path a mounted
// app does.
function renderPalette(onClose = vi.fn(), onSelect = vi.fn()) {
  render(
    <UhProvider>
      <CommandPalette open onClose={onClose} onSelect={onSelect} />
    </UhProvider>,
  );
  return { onClose, onSelect };
}

describe("CommandPalette", () => {
  it("opens showing every destination", async () => {
    renderPalette();

    // Headless UI's Dialog settles its open transition in an effect that
    // lands slightly after this render's own act() scope; `findByRole`
    // polls (and re-wraps in act) until it does, instead of racing it.
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Command palette")).toBeInTheDocument();

    // All nine destinations from destinations.ts, unfiltered.
    for (const label of [
      "Models",
      "Chat",
      "Launch",
      "Codex CLI",
      "Developer",
      "Toolbox",
      "Docs",
      "Status",
      "Settings",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("filters the destination list as the user types", async () => {
    const user = userEvent.setup();
    renderPalette();

    const search = screen.getByLabelText("Command search");
    await user.type(search, "chat");

    expect(screen.getByText("Chat")).toBeInTheDocument();
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
    expect(screen.queryByText("Models")).not.toBeInTheDocument();
  });

  it("shows the no-matches state for a query nothing satisfies", async () => {
    const user = userEvent.setup();
    renderPalette();

    const search = screen.getByLabelText("Command search");
    await user.type(search, "xyzzy-nonexistent");

    expect(screen.getByText("No matches")).toBeInTheDocument();
    expect(screen.queryByText("Models")).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const { onClose } = renderPalette();

    expect(onClose).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
