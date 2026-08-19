import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { UhProvider } from "@/uh";
import { AdvancedCard } from "./AdvancedCard";
import { DEFAULT_UI_PREFERENCES, type UIPreferences } from "./types";

// Two contracts share this one card: scheduled-settings (add/remove a
// dated/weekday-free time+action rule, persisted through `schedules`) and
// external-settings-sources (a read-only, real list of the configured
// Ollama-compatible endpoints, with the active one badged). Both are
// exercised against the real `patchPreferences` write path, mirrored into
// local state exactly like SettingsScreen does, rather than mocked away.
function preferences(overrides: Partial<UIPreferences> = {}): UIPreferences {
  return { ...DEFAULT_UI_PREFERENCES, ...overrides };
}

function Harness({ initial }: { initial: UIPreferences }) {
  const [prefs, setPrefs] = useState(initial);
  const patchPreferences = (partial: Partial<UIPreferences>) =>
    setPrefs((current: UIPreferences) => ({ ...current, ...partial }));
  return <AdvancedCard preferences={prefs} patchPreferences={patchPreferences} preferencesLoading={false} />;
}

function renderCard(initial: UIPreferences = preferences()) {
  render(
    <UhProvider>
      <Harness initial={initial} />
    </UhProvider>,
  );
}

describe("AdvancedCard: scheduled settings", () => {
  it("adds a rule with the picked time and action, and it appears in the real list", async () => {
    const user = userEvent.setup();
    renderCard();

    expect(screen.getByText("No scheduled rules yet.")).toBeInTheDocument();

    const timeInput = screen.getByLabelText("Time");
    fireEvent.change(timeInput, { target: { value: "07:30" } });

    const kindSelect = screen.getByLabelText("Action");
    fireEvent.change(kindSelect, { target: { value: "schoolOn" } });

    await user.click(screen.getByRole("button", { name: "Add rule" }));

    expect(screen.queryByText("No scheduled rules yet.")).not.toBeInTheDocument();
    const ruleRow = screen.getByText("07:30").closest("li");
    expect(ruleRow).not.toBeNull();
    expect(ruleRow).toHaveTextContent("Turn School mode on");
  });

  it("removes exactly the clicked rule, leaving the others in place", async () => {
    const user = userEvent.setup();
    renderCard(
      preferences({
        schedules: [
          { time: "18:00", kind: "dark" },
          { time: "07:00", kind: "light" },
        ],
      }),
    );

    expect(screen.getByText("18:00")).toBeInTheDocument();
    expect(screen.getByText("07:00")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Remove rule — 18:00/ }));

    expect(screen.queryByText("18:00")).not.toBeInTheDocument();
    expect(screen.getByText("07:00")).toBeInTheDocument();
  });
});

describe("AdvancedCard: external settings sources", () => {
  it("shows the honest empty state with no configured endpoints", () => {
    renderCard();
    expect(screen.getByText("Only the default local Ollama server is configured.")).toBeInTheDocument();
  });

  it("lists a real configured endpoint and badges only the active one", () => {
    renderCard(
      preferences({
        endpoints: {
          activeId: "ep-1",
          endpoints: [
            { id: "ep-1", kind: "ollama", label: "Local Ollama", baseUrl: "http://127.0.0.1:11434", tokenSet: false },
            { id: "ep-2", kind: "ollama", label: "Remote box", baseUrl: "http://10.0.0.5:11434", tokenSet: true },
          ],
        },
      }),
    );

    expect(screen.getByText("Local Ollama")).toBeInTheDocument();
    expect(screen.getByText("http://127.0.0.1:11434")).toBeInTheDocument();
    expect(screen.getByText("Remote box")).toBeInTheDocument();
    // Exactly one "active" badge, on the endpoint matching activeId.
    expect(screen.getAllByText("active")).toHaveLength(1);
  });
});
