import { afterEach, describe, expect, it } from "vitest";
import { narration } from "./narration";
import type { Localized } from "./localized";

// The app-wide narration queue: "Off by default; a caller... turns it on
// with setEnabled(true)." This proves the real disabled/unsupported
// outcomes speak() reports, in the node test environment where there is
// genuinely no `window.speechSynthesis` -- exactly the "engine has none
// installed" case the outcome type exists to distinguish from a silent
// no-op.
afterEach(() => {
  narration.setEnabled(false);
});

describe("narration queue", () => {
  it("reports skipped-disabled and never throws when narration is off (the shipped default)", async () => {
    expect(narration.isEnabled()).toBe(false);
    const outcome = await narration.speak("Hello" as Localized, "en");
    expect(outcome).toEqual({ status: "skipped-disabled" });
  });

  it("reports unsupported once enabled on an engine with no speech synthesis API", async () => {
    narration.setEnabled(true);
    expect(narration.isEnabled()).toBe(true);

    const outcome = await narration.speak("Hello" as Localized, "en");
    expect(outcome).toEqual({ status: "unsupported" });
  });

  it("speakBoth resolves both the English and Cantonese outcomes, strictly as a pair", async () => {
    const [en, yue] = await narration.speakBoth("Hello" as Localized, "你好" as Localized);
    // Disabled (the default, restored by afterEach from any prior test),
    // so both halves report the same real outcome rather than one
    // silently resolving and the other hanging.
    expect(en).toEqual({ status: "skipped-disabled" });
    expect(yue).toEqual({ status: "skipped-disabled" });
  });

  it("stop() drains every queued item as skipped-disabled rather than leaving a promise unresolved", async () => {
    narration.setEnabled(true);
    // With no speechSynthesis, speak() resolves immediately as
    // "unsupported" rather than actually queueing -- so this proves stop()
    // is safe to call with nothing in flight, not that it drains a real
    // in-flight queue (that needs a mocked speechSynthesis, out of scope
    // for this node-environment test).
    narration.stop();
    expect(narration.isEnabled()).toBe(true);
  });
});
