import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UhProvider } from "@/uh";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { AppearanceCard } from "./AppearanceCard";
import { DEFAULT_UI_PREFERENCES, type UIPreferences } from "./types";

// Two contracts share this one card: app-display-name (the appName field,
// debounced-committed and reset to the real default) and
// app-logo-customization (the glyph picker, dual-writing preview state
// live). Both dual-write through `patchPreferences`, which this fixture
// mirrors into local state exactly like the real SettingsScreen does, so
// the debounced commit -> patch -> re-render -> provenance-line-updates
// loop is genuinely exercised rather than mocked away. Uses real timers
// (not fake ones) because @testing-library/user-event's internal
// scheduling deadlocks combined with vi.useFakeTimers() in this suite;
// fireEvent plus a real short wait for DebouncedTextField's 600ms commit
// is the reliable route here.
function preferences(overrides: Partial<UIPreferences["appearance"]> = {}): UIPreferences {
  return {
    ...DEFAULT_UI_PREFERENCES,
    appearance: { ...DEFAULT_UI_PREFERENCES.appearance, ...overrides },
  };
}

function Harness({ initial }: { initial: UIPreferences }) {
  const [prefs, setPrefs] = useState(initial);
  const patchPreferences = (partial: Partial<UIPreferences>) =>
    setPrefs((current: UIPreferences) => ({
      ...current,
      ...partial,
      appearance: { ...current.appearance, ...(partial.appearance ?? {}) },
    }));
  return (
    <ThemeProvider>
      <AppearanceCard preferences={prefs} patchPreferences={patchPreferences} preferencesLoading={false} />
    </ThemeProvider>
  );
}

function renderCard(initial: UIPreferences = preferences()) {
  render(
    <UhProvider>
      <Harness initial={initial} />
    </UhProvider>,
  );
}

function wait(ms: number) {
  return act(() => new Promise((resolve) => setTimeout(resolve, ms)));
}

describe("AppearanceCard: app display name", () => {
  it("debounce-commits a typed name and the provenance line reflects the stored value", async () => {
    renderCard();

    const field = screen.getByLabelText("App display name");
    fireEvent.change(field, { target: { value: "My Llama" } });

    // Not committed yet -- DebouncedTextField waits 600ms after the last
    // keystroke before calling onCommit. The card has several other
    // "compiled-in default" provenance lines (seed, theme, radius,
    // glyph) so assert on the app-name-specific one by its default
    // suffix (the placeholder name) rather than the shared prefix alone.
    expect(screen.getByText(/Currently the compiled-in default: Material Ollama/)).toBeInTheDocument();

    await wait(700);

    expect(screen.getByText(/Currently your saved value: My Llama/)).toBeInTheDocument();
  });

  it("the reset button is disabled with no custom name and clears a set one back to blank", () => {
    renderCard(preferences({ appName: "Custom Name" }));

    const resetButton = screen.getByRole("button", { name: 'Reset to "Material Ollama"' });
    expect(resetButton).toBeEnabled();

    fireEvent.click(resetButton);

    expect(screen.getByText(/Currently the compiled-in default: Material Ollama/)).toBeInTheDocument();
    // The reset button disables itself once the name really is empty again.
    expect(screen.getByRole("button", { name: 'Reset to "Material Ollama"' })).toBeDisabled();
  });
});

describe("AppearanceCard: app logo customization", () => {
  it("selecting a glyph marks it pressed and updates the live preview icon", () => {
    renderCard();

    const brandButton = screen.getByRole("button", { name: "Brand mark" });
    expect(brandButton).toHaveAttribute("aria-pressed", "true");

    const rocketButton = screen.getByRole("button", { name: "Logo glyph — rocket_launch" });
    expect(rocketButton).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(rocketButton);

    expect(rocketButton).toHaveAttribute("aria-pressed", "true");
    expect(brandButton).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText(/Currently your saved value: rocket_launch/)).toBeInTheDocument();
  });
});
