import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { UhProvider } from "@/uh";
import { SettingRow } from "./SettingRow";

// "Rendered instead of the control, per the guided-forms contract: a
// disabled control always names its unmet condition." This is the one row
// shape every card on the Settings screen builds from -- exercising it
// directly proves the guided-forms disabled-reason substitution and the
// collapsed-by-default explanation toggle, both real behaviours the
// canonical contract requires and neither decorative.
function renderRow(props: Partial<Parameters<typeof SettingRow>[0]> = {}) {
  render(
    <UhProvider>
      <SettingRow
        icon="palette"
        title="Model location"
        explanation="Where downloaded models are stored on disk."
        provenance="Currently your saved value: C:\Users\demo\.ollama\models"
        {...props}
      >
        <button type="button">Browse…</button>
      </SettingRow>
    </UhProvider>,
  );
}

describe("SettingRow", () => {
  it("renders the real control by default, with its explanation collapsed", () => {
    renderRow();

    expect(screen.getByRole("button", { name: "Browse…" })).toBeInTheDocument();
    expect(
      screen.queryByText("Where downloaded models are stored on disk."),
    ).not.toBeInTheDocument();
  });

  it("substitutes the real control with the named unmet condition when disabled, rather than a bare disabled control", () => {
    renderRow({ disabledReason: "waiting for preferences to load" });

    expect(screen.queryByRole("button", { name: "Browse…" })).not.toBeInTheDocument();
    expect(screen.getByText(/waiting for preferences to load/)).toBeInTheDocument();
    expect(screen.getByText("Unavailable —")).toBeInTheDocument();
  });

  it("expands the explanation on demand via the lightbulb toggle", async () => {
    const user = userEvent.setup();
    renderRow();

    const toggle = screen.getByRole("button", { name: /What does this do/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Where downloaded models are stored on disk.")).toBeInTheDocument();
  });
});
