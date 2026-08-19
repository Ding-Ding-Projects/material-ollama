import { describe, expect, it } from "vitest";
import { applyVocab } from "./vocab";
import type { Localized } from "./localized";

// "Pure find -> replace over already-localized text. Literal substring
// matching only (no regex)... Rules apply in order; a later rule can act
// on an earlier rule's replacement text." This proves each of those
// specific, load-bearing claims rather than just that applyVocab runs.
describe("applyVocab", () => {
  it("replaces every literal occurrence of the find text", () => {
    const rules = [{ find: "Ollama", replace: "Llama Pal" }];
    const result = applyVocab("Ollama is great. Ollama runs locally." as Localized, rules);
    expect(result).toBe("Llama Pal is great. Llama Pal runs locally.");
  });

  it("treats a find value containing regex metacharacters as a literal string, not a pattern", () => {
    const rules = [{ find: "1.5x (fast)", replace: "quick mode" }];
    // If this were run through RegExp, "." and "(" ")" would each behave
    // as metacharacters and this exact literal substring would still
    // match by coincidence in some inputs but not reliably -- assert the
    // literal string specifically, including a near-miss that a regex
    // interpretation would wrongly also match.
    const result = applyVocab("Speed: 1.5x (fast) mode" as Localized, rules);
    expect(result).toBe("Speed: quick mode mode");
    const nearMiss = applyVocab("Speed: 1X5x (fast) mode" as Localized, rules);
    expect(nearMiss).toBe("Speed: 1X5x (fast) mode"); // "." must not match "X"
  });

  it("applies rules in order, letting a later rule act on an earlier rule's output", () => {
    const rules = [
      { find: "cat", replace: "dog" },
      { find: "dog", replace: "fish" },
    ];
    // "cat" -> "dog" (rule 1), then every "dog" (including the one just
    // produced) -> "fish" (rule 2).
    expect(applyVocab("A cat and a dog." as Localized, rules)).toBe("A fish and a fish.");
  });

  it("skips a rule with an empty find value rather than replacing every character", () => {
    const rules = [{ find: "", replace: "X" }];
    expect(applyVocab("unchanged" as Localized, rules)).toBe("unchanged");
  });

  it("returns the original text unchanged when there are no rules", () => {
    expect(applyVocab("unchanged" as Localized, [])).toBe("unchanged");
  });
});
