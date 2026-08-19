import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { UhProvider } from "@/uh";
import { LanguageVoiceCard } from "./LanguageVoiceCard";
import { DEFAULT_UI_PREFERENCES, type UIPreferences } from "./types";

// "Both funny-level sliders are a shipping requirement... two independent
// controls (one per language), actually wired to the copy the app
// renders." This proves the English and Cantonese funny-level controls
// are genuinely independent -- changing one must never move the other --
// through the real patchPreferences write path.
function Harness({ initial }: { initial: UIPreferences }) {
  const [prefs, setPrefs] = useState(initial);
  const patchPreferences = (partial: Partial<UIPreferences>) =>
    setPrefs((current) => ({ ...current, ...partial }));
  return <LanguageVoiceCard preferences={prefs} patchPreferences={patchPreferences} preferencesLoading={false} />;
}

function renderCard(initial: UIPreferences = DEFAULT_UI_PREFERENCES) {
  render(
    <UhProvider>
      <Harness initial={initial} />
    </UhProvider>,
  );
}

describe("LanguageVoiceCard: funny level controls", () => {
  it("both sliders start at the compiled-in default level 2 (Balanced) independently", () => {
    renderCard();

    const englishRow = screen.getByText("English funny level").closest(".min-w-0")!;
    const cantoneseRow = screen.getByText("Cantonese funny level").closest(".min-w-0")!;

    expect(englishRow).toHaveTextContent("Currently the compiled-in default: Balanced");
    expect(cantoneseRow).toHaveTextContent("Currently the compiled-in default: Balanced");
  });

  it("raising the English level to Maximum fun leaves the Cantonese level untouched", async () => {
    const user = userEvent.setup();
    renderCard();

    // Two "Maximum fun" chips exist (one per language group); the English
    // one is the first in document order.
    const maxFunChips = screen.getAllByText("Maximum fun");
    await user.click(maxFunChips[0]);

    const englishRow = screen.getByText("English funny level").closest(".min-w-0")!;
    const cantoneseRow = screen.getByText("Cantonese funny level").closest(".min-w-0")!;

    expect(englishRow).toHaveTextContent("Currently your saved value: Maximum fun");
    expect(cantoneseRow).toHaveTextContent("Currently the compiled-in default: Balanced");
  });

  it("lowering the Cantonese level to Fully serious leaves the English level untouched", async () => {
    const user = userEvent.setup();
    renderCard();

    const seriousChips = screen.getAllByText("Fully serious");
    // The Cantonese group's chip is the second one in document order.
    await user.click(seriousChips[1]);

    const englishRow = screen.getByText("English funny level").closest(".min-w-0")!;
    const cantoneseRow = screen.getByText("Cantonese funny level").closest(".min-w-0")!;

    expect(englishRow).toHaveTextContent("Currently the compiled-in default: Balanced");
    expect(cantoneseRow).toHaveTextContent("Currently your saved value: Fully serious");
  });
});
