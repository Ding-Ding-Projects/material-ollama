import { render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  PREFERENCES_CHANGED_EVENT,
  PREFERENCES_STORAGE_KEY,
  UhProvider,
  useUh,
} from "@/uh";

// app-display-name shipped half-wired for a while: the Settings card saved
// appearance.appName, the Go store persisted it, and absolutely nothing read
// it back -- the title bar rendered a hardcoded constant. Every test passed,
// the setting "worked", and the app never changed its name.
//
// These assert the read path specifically, because the write path was never
// the broken half.

function Probe() {
  const voice = useUh();
  return <span data-testid="name">{voice.appName || "(unset)"}</span>;
}

function renderWithStored(shape: unknown) {
  window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(shape));
  return render(
    <UhProvider>
      <Probe />
    </UhProvider>,
  );
}

afterEach(() => {
  window.localStorage.clear();
});

describe("app display name reaches the voice", () => {
  it("reports the unset state when the user has never renamed the app", () => {
    renderWithStored({ langMode: "en" });
    expect(screen.getByTestId("name").textContent).toBe("(unset)");
  });

  it("reads a chosen name out of stored preferences", () => {
    renderWithStored({ langMode: "en", appName: "Dim Sum Machine" });
    expect(screen.getByTestId("name").textContent).toBe("Dim Sum Machine");
  });

  it("trims surrounding whitespace rather than rendering a padded name", () => {
    renderWithStored({ langMode: "en", appName: "   Padded   " });
    expect(screen.getByTestId("name").textContent).toBe("Padded");
  });

  it("ignores a non-string name instead of rendering [object Object]", () => {
    renderWithStored({ langMode: "en", appName: { evil: true } });
    expect(screen.getByTestId("name").textContent).toBe("(unset)");
  });

  it("keeps the chosen name under School mode", () => {
    // School mode suppresses the language, funny-level, vocabulary and
    // dim-sum capabilities. A rename is none of those, and clearing it would
    // rename the user's app for a reason School mode never claimed.
    renderWithStored({ langMode: "yue", school: { on: true }, appName: "Study Buddy" });
    expect(screen.getByTestId("name").textContent).toBe("Study Buddy");
  });

  it("picks up a rename live, with no reload", () => {
    renderWithStored({ langMode: "en", appName: "First" });
    expect(screen.getByTestId("name").textContent).toBe("First");

    act(() => {
      window.localStorage.setItem(
        PREFERENCES_STORAGE_KEY,
        JSON.stringify({ langMode: "en", appName: "Second" }),
      );
      window.dispatchEvent(new Event(PREFERENCES_CHANGED_EVENT));
    });

    expect(screen.getByTestId("name").textContent).toBe("Second");
  });
});
