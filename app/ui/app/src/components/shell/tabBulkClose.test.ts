import { describe, expect, it } from "vitest";
import { selectBulkClose, type BulkCloseCandidate } from "./tabBulkClose";

const CANDIDATES: BulkCloseCandidate[] = [
  { tabId: "t1", label: "Models", pinned: false },
  { tabId: "t2", label: "Chat", pinned: false },
  { tabId: "t3", label: "Launch", pinned: true },
  { tabId: "t4", label: "Codex CLI", pinned: false },
  { tabId: "t5", label: "Developer", pinned: false },
  { tabId: "t6", label: "Toolbox", pinned: false },
];

describe("selectBulkClose", () => {
  it("never runs on an empty query — neither direction closes anything", () => {
    const containing = selectBulkClose(CANDIDATES, { text: "", regexMode: false, flags: "" }, "containing", true);
    const notContaining = selectBulkClose(
      CANDIDATES,
      { text: "   ", regexMode: false, flags: "" },
      "notContaining",
      true,
    );
    expect(containing.toClose).toHaveLength(0);
    expect(notContaining.toClose).toHaveLength(0);
  });

  it("the inverse predicate agrees with its positive form: containing and notContaining partition the full set", () => {
    const query = { text: "o", regexMode: false, flags: "" };
    // includePinned: true on both sides so the partition property is about
    // the match predicate alone, not entangled with the pinned guard.
    const containing = selectBulkClose(CANDIDATES, query, "containing", true);
    const notContaining = selectBulkClose(CANDIDATES, query, "notContaining", true);

    const containingIds = new Set(containing.toClose.map((c) => c.tabId));
    const notContainingIds = new Set(notContaining.toClose.map((c) => c.tabId));

    // Every candidate ends up on exactly one side.
    expect(containingIds.size + notContainingIds.size).toBe(CANDIDATES.length);
    for (const id of containingIds) expect(notContainingIds.has(id)).toBe(false);
    for (const candidate of CANDIDATES) {
      expect(containingIds.has(candidate.tabId) || notContainingIds.has(candidate.tabId)).toBe(true);
    }

    // Sanity-check the actual membership, not just the arithmetic. "o"
    // appears in Models, Codex CLI, Developer, and Toolbox; Chat and
    // Launch have none.
    expect([...containingIds].sort()).toEqual(["t1", "t4", "t5", "t6"]);
    expect([...notContainingIds].sort()).toEqual(["t2", "t3"]);
  });

  it("agrees for a regex query too, including a pattern that matches nothing", () => {
    const matchesSomething = { text: "^C", regexMode: true, flags: "" };
    const containing = selectBulkClose(CANDIDATES, matchesSomething, "containing", true);
    const notContaining = selectBulkClose(CANDIDATES, matchesSomething, "notContaining", true);
    expect(containing.toClose.map((c) => c.tabId).sort()).toEqual(["t2", "t4"]);
    expect(notContaining.toClose.map((c) => c.tabId).sort()).toEqual(["t1", "t3", "t5", "t6"]);
    expect(containing.toClose.length + notContaining.toClose.length).toBe(CANDIDATES.length);

    const matchesNothing = { text: "zzzzz", regexMode: true, flags: "" };
    const noHits = selectBulkClose(CANDIDATES, matchesNothing, "containing", true);
    const allMiss = selectBulkClose(CANDIDATES, matchesNothing, "notContaining", true);
    expect(noHits.toClose).toHaveLength(0);
    expect(allMiss.toClose.length).toBe(CANDIDATES.length);
  });

  it("excludes pinned matches by default and reports them separately, in both directions", () => {
    const query = { text: "a", regexMode: false, flags: "" }; // matches "Launch"
    const containing = selectBulkClose(CANDIDATES, query, "containing", false);
    expect(containing.toClose.some((c) => c.tabId === "t3")).toBe(false);
    expect(containing.excludedPinned.map((c) => c.tabId)).toEqual(["t3"]);

    const withPinned = selectBulkClose(CANDIDATES, query, "containing", true);
    expect(withPinned.toClose.some((c) => c.tabId === "t3")).toBe(true);
    expect(withPinned.excludedPinned).toHaveLength(0);
  });

  it("an invalid regex pattern matches nothing rather than throwing", () => {
    const broken = { text: "(unterminated", regexMode: true, flags: "" };
    expect(() => selectBulkClose(CANDIDATES, broken, "containing", true)).not.toThrow();
    const result = selectBulkClose(CANDIDATES, broken, "containing", true);
    expect(result.toClose).toHaveLength(0);
  });
});
