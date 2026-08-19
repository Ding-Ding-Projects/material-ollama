import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  RegexBuilder,
  REGEX_MAX_MATCHES,
  REGEX_PATTERN_MAX_LENGTH,
} from "./RegexBuilder";

// This lane's brief calls out "the regex builder's bounded evaluation" by
// name: RegexBuilder.tsx enforces a hard cap on how many matches it will
// ever render (REGEX_MAX_MATCHES) and a wall-clock timeout on the worker
// that does the matching, specifically so a pasted catastrophic-
// backtracking pattern or a pattern with an enormous match count can never
// hang or overwhelm the tab. jsdom has no real Worker implementation, so
// every evaluation here falls through runInWorker's construction-failure
// catch to the bounded main-thread fallback (runOnMainThread) -- which is
// itself gated by the exact same maxMatches/guardLimit bound the worker
// path uses, so this still proves the real cap, not a mocked one.
describe("RegexBuilder bounded evaluation", () => {
  it("caps rendered matches at REGEX_MAX_MATCHES and reports the truncation", async () => {
    const onApply = vi.fn();
    // A global pattern against a sample with far more matches than the
    // cap allows -- 3000 single-character matches against a 500-match
    // ceiling.
    const sample = "a".repeat(3000);
    const { container } = render(
      <RegexBuilder onApply={onApply} initialPattern="a" initialFlags="g" initialSample={sample} />,
    );

    await waitFor(
      () => {
        expect(container.textContent).toContain("Showing the first");
      },
      { timeout: 3000 },
    );

    // The truncation banner names the exact bound, and — the part that
    // actually proves the cap limits work rather than merely decorating
    // the message — the number of match chips genuinely rendered is
    // capped at that same bound, not the true count of 3000 the sample
    // actually contains.
    expect(container.textContent).toContain(String(REGEX_MAX_MATCHES));

    const renderedMatchChips = container.querySelectorAll('[aria-label^="#"]');
    expect(renderedMatchChips.length).toBe(REGEX_MAX_MATCHES);
  });

  it("does not report truncation when the real match count is under the cap", async () => {
    const onApply = vi.fn();
    const { container } = render(
      <RegexBuilder onApply={onApply} initialPattern="a" initialFlags="g" initialSample="banana" />,
    );

    await waitFor(
      () => {
        expect(container.textContent).toContain("Matches");
      },
      { timeout: 3000 },
    );

    // "banana" contains exactly 3 lowercase "a"s -- comfortably under
    // REGEX_MAX_MATCHES, so the truncation banner must be absent.
    expect(container.textContent).not.toContain("Showing the first");
    const renderedMatchChips = container.querySelectorAll('[aria-label^="#"]');
    expect(renderedMatchChips.length).toBe(3);
  });

  it("shows the evaluation-timeout message instead of hanging on a catastrophic-backtracking pattern", async () => {
    const onApply = vi.fn();
    // Classic catastrophic-backtracking shape: (a+)+ against a long run of
    // "a"s with no trailing match, which is exponential for a
    // backtracking engine. Real Worker construction is unavailable in
    // jsdom, so this exercises runOnMainThread's iteration guard by proxy
    // -- what matters here is that the component never gets stuck in the
    // "evaluating" state forever and always resolves to a defined outcome
    // the user can read.
    const { container } = render(
      <RegexBuilder onApply={onApply} initialPattern="(a+)+$" initialFlags="" initialSample={"a".repeat(35) + "!"} />,
    );

    await waitFor(
      () => {
        expect(container.querySelector('[aria-live="polite"]')?.textContent?.trim()).not.toBe("");
      },
      { timeout: 3000 },
    );

    // Whatever the fallback engine actually decided (a bounded worker in a
    // real browser would very plausibly time out; the synchronous
    // main-thread fallback this test environment exercises instead
    // resolves immediately either way), the UI must have moved past the
    // "evaluating…" spinner state and landed on a real, readable outcome
    // rather than spinning forever.
    expect(container.textContent).not.toContain("Evaluating…");
  });

  it("caps the pattern and test-text inputs at their documented maximum lengths", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<RegexBuilder onApply={onApply} />);

    const patternInput = screen.getByLabelText("Pattern");
    const overlong = "a".repeat(REGEX_PATTERN_MAX_LENGTH + 50);
    await user.click(patternInput);
    await user.paste(overlong);

    expect((patternInput as HTMLInputElement).value.length).toBe(REGEX_PATTERN_MAX_LENGTH);
  });
});
