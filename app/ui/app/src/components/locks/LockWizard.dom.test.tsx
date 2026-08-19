import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UhProvider } from "@/uh";
import { LockWizard } from "./LockWizard";

// The blank-slate-presets contract: applying a preset only sets the
// wizard's own draft method/duration state -- nothing is written until
// Confirm runs (recorded in this inventory's `persistence` field for this
// row). This proves a preset genuinely drives the two real controls
// beneath it (a method radio group, a duration select) rather than being
// a label with no wiring.
function renderWizard() {
  const onClose = vi.fn();
  const onCreated = vi.fn();
  render(
    <UhProvider>
      <LockWizard
        open
        anchorEl={null}
        onClose={onClose}
        elementId="test-element"
        label="Test element"
        onCreated={onCreated}
      />
    </UhProvider>,
  );
  return { onClose, onCreated };
}

function durationSelect(): HTMLSelectElement {
  return screen.getByLabelText("Unlock duration") as HTMLSelectElement;
}

describe("LockWizard blank-slate presets", () => {
  it("starts on the Password method and Surface duration before any preset is chosen", async () => {
    renderWizard();

    const passwordRadio = await screen.findByRole("radio", { name: "Password" });
    expect(passwordRadio).toHaveAttribute("aria-checked", "true");
    expect(durationSelect().value).toBe("surface");
  });

  it("applying the Session code preset switches both the method and duration controls together", async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(await screen.findByText("Session code lock"));

    expect(screen.getByRole("radio", { name: "Authenticator code" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Password" })).toHaveAttribute("aria-checked", "false");
    expect(durationSelect().value).toBe("untilClose");
  });

  it("applying a different preset overrides a manually-selected method rather than merging with it", async () => {
    const user = userEvent.setup();
    renderWizard();

    // Manually pick TOTP first.
    await user.click(screen.getByRole("radio", { name: "Authenticator code" }));
    expect(screen.getByRole("radio", { name: "Authenticator code" })).toHaveAttribute("aria-checked", "true");

    // The quick-password preset must win outright, not merge with the
    // manual choice.
    await user.click(screen.getByText("Quick password lock"));

    expect(screen.getByRole("radio", { name: "Password" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Authenticator code" })).toHaveAttribute("aria-checked", "false");
    expect(durationSelect().value).toBe("surface");
  });
});
