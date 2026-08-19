import { describe, expect, it } from "vitest"
import { matchesDateRange } from "./dateRange"

describe("matchesDateRange", () => {
  it("matches everything when both bounds are open", () => {
    expect(matchesDateRange("2026-08-18", { from: null, to: null })).toBe(true)
    expect(matchesDateRange("1999-01-01", { from: null, to: null })).toBe(true)
  })

  it("honours a one-sided lower bound", () => {
    const range = { from: "2026-08-18", to: null }
    expect(matchesDateRange("2026-08-17", range)).toBe(false)
    expect(matchesDateRange("2026-08-18", range)).toBe(true)
    expect(matchesDateRange("2026-08-19", range)).toBe(true)
  })

  it("honours a one-sided upper bound", () => {
    const range = { from: null, to: "2026-08-18" }
    expect(matchesDateRange("2026-08-17", range)).toBe(true)
    expect(matchesDateRange("2026-08-18", range)).toBe(true)
    expect(matchesDateRange("2026-08-19", range)).toBe(false)
  })

  it("honours a closed range inclusively on both ends", () => {
    const range = { from: "2026-08-15", to: "2026-08-18" }
    expect(matchesDateRange("2026-08-14", range)).toBe(false)
    expect(matchesDateRange("2026-08-15", range)).toBe(true)
    expect(matchesDateRange("2026-08-16", range)).toBe(true)
    expect(matchesDateRange("2026-08-18", range)).toBe(true)
    expect(matchesDateRange("2026-08-19", range)).toBe(false)
  })

  it("matches nothing for an inverted range rather than silently swapping it", () => {
    const range = { from: "2026-08-19", to: "2026-08-15" }
    expect(matchesDateRange("2026-08-16", range)).toBe(false)
    expect(matchesDateRange("2026-08-19", range)).toBe(false)
    expect(matchesDateRange("2026-08-15", range)).toBe(false)
  })

  it("compares only the date portion of a full ISO timestamp", () => {
    const range = { from: "2026-08-18", to: "2026-08-18" }
    expect(matchesDateRange("2026-08-18T23:59:59Z", range)).toBe(true)
    expect(matchesDateRange("2026-08-19T00:00:01Z", range)).toBe(false)
  })
})
