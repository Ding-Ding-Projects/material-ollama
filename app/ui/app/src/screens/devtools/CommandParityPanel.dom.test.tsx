import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { UhProvider } from "@/uh";
import type { CommandCapability } from "@/lib/cli-config";
import { CommandParityPanel } from "./CommandParityPanel";

// The CLI <-> GUI parity table: every command the live Cobra tree reports,
// with hidden commands carrying a distinct badge and each row's GUIRoute
// rendered as a real link only when this build actually routes there
// (isRoutedGuiRoute in ./lib narrows that to the "models" prefix) or an
// honest non-interactive path label otherwise. Both fixture commands use a
// guiRoute the router never treats as routed ("chat/run" / "service", per
// ./lib's own comment on the prefixes it deliberately excludes) so the
// panel renders its plain-span branch rather than tanstack/react-router's
// <Link>, which throws outside a mounted RouterProvider -- exactly the
// real "no screen renders it yet" case this contract exists to label
// honestly, not a test workaround.
const COMMANDS: CommandCapability[] = [
  {
    id: "ollama",
    name: "ollama",
    use: "ollama",
    description: "Large language model runner",
    hidden: false,
    guiRoute: "chat/run",
  },
  {
    id: "ollama-serve",
    name: "serve",
    use: "serve",
    description: "Start the Ollama service",
    hidden: true,
    guiRoute: "service",
    flags: [{ name: "port", type: "string", persistent: false, usage: "Bind port" }],
  },
];

function renderPanel(commands: CommandCapability[] = COMMANDS) {
  render(
    <UhProvider>
      <CommandParityPanel commands={commands} />
    </UhProvider>,
  );
}

describe("CommandParityPanel", () => {
  it("marks an unrouted command's GUI route as a non-interactive label, not a link", () => {
    renderPanel();

    // Neither fixture's guiRoute ("chat/run", "service") satisfies
    // isRoutedGuiRoute()'s "models"-prefix check, so both paths must
    // render as plain text with no link role, not as a clickable route.
    expect(screen.getByText("service")).toBeInTheDocument();
    expect(screen.getByText("chat/run")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders the hidden badge only on the command actually marked hidden", () => {
    renderPanel();

    // Both commands have the same "hidden" text present in the summary
    // count badge, so scope to the per-command Hidden badges by role.
    const hiddenBadges = screen.getAllByText("Hidden");
    // One row-level "Hidden" badge for the one hidden command.
    expect(hiddenBadges).toHaveLength(1);
  });

  it("filters the command list to matches of the typed query", async () => {
    const user = userEvent.setup();
    renderPanel();

    expect(screen.getByText("ollama")).toBeInTheDocument();
    expect(screen.getByText("serve")).toBeInTheDocument();

    const search = screen.getByLabelText("Search commands");
    await user.type(search, "serve");

    expect(screen.getByText("serve")).toBeInTheDocument();
    expect(screen.queryByText("ollama")).not.toBeInTheDocument();
  });

  it("shows the no-commands-match state once the query excludes everything", async () => {
    const user = userEvent.setup();
    renderPanel();

    const search = screen.getByLabelText("Search commands");
    await user.type(search, "xyzzy-nonexistent-command");

    expect(screen.getByText("No commands match.")).toBeInTheDocument();
    expect(screen.queryByText("ollama")).not.toBeInTheDocument();
  });
});
