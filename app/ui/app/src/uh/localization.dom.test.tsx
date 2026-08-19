import { render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  PREFERENCES_CHANGED_EVENT,
  PREFERENCES_STORAGE_KEY,
  UhProvider,
  applyVocab,
  fact,
  funny,
  useShows,
  useT,
  useUh,
} from "@/uh";
import type { Localized } from "@/uh";

// This is the "localization" suite area's own real, black-box coverage:
// the three language modes, both funny-level suffix tables, School mode's
// forced-English override of every gated feature family, and the pure
// find/replace vocabulary and fact()/funny() escape hatches -- exercised
// through the actual exported public surface (UhProvider/useT/useUh/
// useShows/funny/applyVocab/fact), never a reimplementation of the logic
// under test. Nothing here mocks localStorage: every scenario writes the
// exact JSON shape provider.tsx's own readStoredPreferences() parses, into
// the real PREFERENCES_STORAGE_KEY, and dispatches the real
// PREFERENCES_CHANGED_EVENT the same way a real settings write would.

afterEach(() => {
  window.localStorage.clear();
});

function setPreferences(prefs: Record<string, unknown>) {
  window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(prefs));
}

// Probe renders every fact this suite needs to see at once: the app-
// namespace translation of a real dictionary key ("newChat" — see
// dict/app.dict.ts), the raw Voice fields, and whether each of the four
// School-gated feature families would show.
function Probe() {
  const t = useT("app");
  const voice = useUh();
  const showsCantonese = useShows("cantonese");
  const showsHumour = useShows("humour");
  const showsDimsum = useShows("dimsum");
  const showsVocab = useShows("vocab");
  return (
    <div>
      <span data-testid="text">{t("newChat")}</span>
      <span data-testid="langMode">{voice.langMode}</span>
      <span data-testid="funnyEn">{voice.funnyEn}</span>
      <span data-testid="funnyYue">{voice.funnyYue}</span>
      <span data-testid="emoji">{String(voice.emoji)}</span>
      <span data-testid="schoolOn">{String(voice.schoolOn)}</span>
      <span data-testid="showsCantonese">{String(showsCantonese)}</span>
      <span data-testid="showsHumour">{String(showsHumour)}</span>
      <span data-testid="showsDimsum">{String(showsDimsum)}</span>
      <span data-testid="showsVocab">{String(showsVocab)}</span>
    </div>
  );
}

function renderProbe() {
  return render(
    <UhProvider>
      <Probe />
    </UhProvider>,
  );
}

describe("UhProvider + useT: the three language modes", () => {
  it("defaults to English when nothing is stored", () => {
    renderProbe();
    expect(screen.getByTestId("text")).toHaveTextContent("New chat");
    expect(screen.getByTestId("langMode")).toHaveTextContent("en");
  });

  it("renders the Cantonese half of the dictionary entry in yue mode", () => {
    setPreferences({ langMode: "yue" });
    renderProbe();
    expect(screen.getByTestId("langMode")).toHaveTextContent("yue");
    // app.dict.ts: newChat -> ["New chat", "開新傾偈"]
    expect(screen.getByTestId("text")).toHaveTextContent("開新傾偈");
  });

  it("renders 'english · cantonese' in bilingual (both) mode", () => {
    setPreferences({ langMode: "both" });
    renderProbe();
    expect(screen.getByTestId("langMode")).toHaveTextContent("both");
    expect(screen.getByTestId("text")).toHaveTextContent("New chat · 開新傾偈");
  });

  it("falls back to English for any unrecognized stored langMode value", () => {
    setPreferences({ langMode: "klingon" });
    renderProbe();
    expect(screen.getByTestId("langMode")).toHaveTextContent("en");
  });

  it("picks up a live preference change with no reload, via PREFERENCES_CHANGED_EVENT", () => {
    renderProbe();
    expect(screen.getByTestId("langMode")).toHaveTextContent("en");

    act(() => {
      setPreferences({ langMode: "yue" });
      window.dispatchEvent(new Event(PREFERENCES_CHANGED_EVENT));
    });

    expect(screen.getByTestId("langMode")).toHaveTextContent("yue");
    expect(screen.getByTestId("text")).toHaveTextContent("開新傾偈");
  });
});

describe("School mode: forces English and hides every gated family", () => {
  it("overrides a stored Cantonese/bilingual langMode back to English while school.on is true", () => {
    setPreferences({
      langMode: "yue",
      funnyEn: 4,
      funnyYue: 4,
      emoji: true,
      school: { on: true },
    });
    renderProbe();

    expect(screen.getByTestId("schoolOn")).toHaveTextContent("true");
    expect(screen.getByTestId("langMode")).toHaveTextContent("en");
    expect(screen.getByTestId("funnyEn")).toHaveTextContent("0");
    expect(screen.getByTestId("funnyYue")).toHaveTextContent("0");
    expect(screen.getByTestId("emoji")).toHaveTextContent("false");
    expect(screen.getByTestId("text")).toHaveTextContent("New chat");
  });

  it("hides Cantonese, humour, dim sum and personal vocabulary while on, and shows all four while off", () => {
    setPreferences({ school: { on: true } });
    const { unmount } = renderProbe();
    expect(screen.getByTestId("showsCantonese")).toHaveTextContent("false");
    expect(screen.getByTestId("showsHumour")).toHaveTextContent("false");
    expect(screen.getByTestId("showsDimsum")).toHaveTextContent("false");
    expect(screen.getByTestId("showsVocab")).toHaveTextContent("false");
    unmount();

    window.localStorage.clear();
    setPreferences({ school: { on: false } });
    renderProbe();
    expect(screen.getByTestId("showsCantonese")).toHaveTextContent("true");
    expect(screen.getByTestId("showsHumour")).toHaveTextContent("true");
    expect(screen.getByTestId("showsDimsum")).toHaveTextContent("true");
    expect(screen.getByTestId("showsVocab")).toHaveTextContent("true");
  });

  it("ignores a school value that is not the { on: true } shape (e.g. a bare true, or missing)", () => {
    setPreferences({ langMode: "yue", school: true });
    renderProbe();
    // A malformed school value must fail closed to "off", never silently
    // interpreted as on -- isSchoolOn() requires a real object with `on`.
    expect(screen.getByTestId("schoolOn")).toHaveTextContent("false");
    expect(screen.getByTestId("langMode")).toHaveTextContent("yue");
  });
});

describe("funny(): pure per-level, per-language suffix and emoji rules", () => {
  it("levels 0 and 1 add no suffix in either language", () => {
    expect(
      funny("Done" as Localized, { lang: "en", level: 0, emoji: false }),
    ).toBe("Done");
    expect(
      funny("Done" as Localized, { lang: "en", level: 1, emoji: false }),
    ).toBe("Done");
    expect(
      funny("搞掂" as Localized, { lang: "yue", level: 1, emoji: false }),
    ).toBe("搞掂");
  });

  it("levels 2-4 append the documented English suffix table", () => {
    expect(
      funny("Saved" as Localized, { lang: "en", level: 2, emoji: false }),
    ).toBe("Saved Nice.");
    expect(
      funny("Saved" as Localized, { lang: "en", level: 3, emoji: false }),
    ).toBe("Saved Woohoo!");
    expect(
      funny("Saved" as Localized, { lang: "en", level: 4, emoji: false }),
    ).toBe("Saved Absolutely legendary!!");
  });

  it("levels 2-4 append the documented Cantonese suffix table", () => {
    expect(
      funny("搞掂" as Localized, { lang: "yue", level: 2, emoji: false }),
    ).toBe("搞掂，幾好吖。");
    expect(
      funny("搞掂" as Localized, { lang: "yue", level: 4, emoji: false }),
    ).toBe("搞掂，勁到飛起！！");
  });

  it("adds an emoji only at level >= 2 with emoji enabled, and escalates the emoji at level 4", () => {
    expect(
      funny("Saved" as Localized, { lang: "en", level: 2, emoji: false }),
    ).not.toMatch(/[✨🎉🥟]/u);
    expect(
      funny("Saved" as Localized, { lang: "en", level: 1, emoji: true }),
    ).not.toMatch(/[✨🎉🥟]/u);
    expect(
      funny("Saved" as Localized, { lang: "en", level: 2, emoji: true }),
    ).toContain("✨");
    expect(
      funny("Saved" as Localized, { lang: "en", level: 4, emoji: true }),
    ).toContain("🎉🥟");
  });
});

describe("applyVocab(): literal find/replace over already-localized text", () => {
  it("returns the text unchanged when there are no rules", () => {
    const text = "Hello there" as Localized;
    expect(applyVocab(text, [])).toBe(text);
  });

  it("applies a literal substring replacement, not a regex", () => {
    const text = "The (model) failed to load" as Localized;
    const got = applyVocab(text, [{ find: "(model)", replace: "llama3" }]);
    expect(got).toBe("The llama3 failed to load");
  });

  it("applies rules in order, letting a later rule act on an earlier rule's output", () => {
    const text = "AAA" as Localized;
    const got = applyVocab(text, [
      { find: "A", replace: "AB" },
      { find: "AB", replace: "X" },
    ]);
    // Left-to-right split/join per occurrence of "A" first turns "AAA"
    // into "ABABAB", and the second rule then turns every "AB" into "X".
    expect(got).toBe("XXX");
  });

  it("skips a rule whose find is the empty string rather than looping or corrupting the text", () => {
    const text = "unchanged" as Localized;
    expect(applyVocab(text, [{ find: "", replace: "!!" }])).toBe("unchanged");
  });

  it("replaces every occurrence of a repeated find value", () => {
    const text = "cat cat cat" as Localized;
    expect(applyVocab(text, [{ find: "cat", replace: "dog" }])).toBe(
      "dog dog dog",
    );
  });
});

describe("fact(): the escape hatch for untranslated data", () => {
  it("stringifies a numeric fact verbatim", () => {
    expect(fact(42, "count")).toBe("42");
  });

  it("passes a string fact through unchanged regardless of kind", () => {
    expect(fact("llama3:8b", "model-name")).toBe("llama3:8b");
    expect(fact("/Users/x/models", "path")).toBe("/Users/x/models");
  });
});
