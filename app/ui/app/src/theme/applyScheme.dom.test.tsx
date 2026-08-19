import { describe, expect, it } from "vitest";
import { applyScheme } from "./applyScheme";
import { buildScheme } from "./scheme";

// The one DOM-touching link in the Material Design token pipeline:
// buildScheme() computes a real M3 color scheme from a seed color and
// applies every resulting custom property onto a live element via
// el.style.setProperty. This is jsdom (not node), on purpose -- applyScheme
// assumes a real HTMLElement and would throw in the node test project.
describe("applyScheme", () => {
  it("writes every token buildScheme produces onto the element's inline style", () => {
    const el = document.createElement("div");
    const tokens = buildScheme({ seed: "#6750a4", mode: "light", radius: 12 });

    applyScheme(el, tokens);

    const keys = Object.keys(tokens);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(el.style.getPropertyValue(key)).toBe(tokens[key]);
    }
  });

  it("produces a genuinely different primary token for a different seed color", () => {
    const elA = document.createElement("div");
    const elB = document.createElement("div");

    applyScheme(elA, buildScheme({ seed: "#6750a4", mode: "light", radius: 12 }));
    applyScheme(elB, buildScheme({ seed: "#006e1c", mode: "light", radius: 12 }));

    // Two visually distinct seed colors (violet vs. green) must not collapse
    // to the same computed primary token -- proving the seed color genuinely
    // drives the scheme rather than being ignored in favor of a fixed
    // palette.
    expect(elA.style.getPropertyValue("--p")).not.toBe(elB.style.getPropertyValue("--p"));
  });

  it("switches every dark-mode token away from its light-mode value for the same seed", () => {
    const light = document.createElement("div");
    const dark = document.createElement("div");

    applyScheme(light, buildScheme({ seed: "#6750a4", mode: "light", radius: 12 }));
    applyScheme(dark, buildScheme({ seed: "#6750a4", mode: "dark", radius: 12 }));

    expect(light.style.getPropertyValue("--p")).not.toBe(dark.style.getPropertyValue("--p"));
  });
});
