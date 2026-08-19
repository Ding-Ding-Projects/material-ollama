import { describe, expect, it } from "vitest"
import { rollDimSumSurprise } from "./dimSumSurprise"
import type { ReleaseCatalogDish } from "./types"

const CATALOG: ReleaseCatalogDish[] = [
  { id: "har-gow", nameEn: "Har Gow", nameZhHant: "蝦餃" },
  { id: "siu-mai", nameEn: "Siu Mai", nameZhHant: "燒賣" },
  { id: "cha-siu-bao", nameEn: "Char Siu Bao", nameZhHant: "叉燒包" },
]

function sequence(...values: number[]): () => number {
  let i = 0
  return () => {
    const value = values[Math.min(i, values.length - 1)]
    i += 1
    return value as number
  }
}

describe("rollDimSumSurprise", () => {
  it("returns null for an empty catalog no matter what the roll is", () => {
    expect(rollDimSumSurprise([], sequence(0, 0))).toBeNull()
  })

  it("returns null when the 10% roll misses", () => {
    expect(rollDimSumSurprise(CATALOG, sequence(0.1))).toBeNull()
    expect(rollDimSumSurprise(CATALOG, sequence(0.99))).toBeNull()
  })

  it("returns a real catalog dish when the roll hits", () => {
    // First draw < 0.1 fires the surprise; second draw picks the dish.
    expect(rollDimSumSurprise(CATALOG, sequence(0, 0))).toBe(CATALOG[0])
    expect(rollDimSumSurprise(CATALOG, sequence(0.05, 0.5))).toBe(CATALOG[1])
    // A second draw right at the top edge must still resolve to the last
    // dish, never index out of bounds.
    expect(rollDimSumSurprise(CATALOG, sequence(0.05, 0.999999))).toBe(CATALOG[2])
  })

  it("never fabricates a dish outside the supplied catalog", () => {
    for (let trial = 0; trial < 50; trial += 1) {
      const dish = rollDimSumSurprise(CATALOG, sequence(0.05, trial / 50))
      expect(dish === null || CATALOG.includes(dish)).toBe(true)
    }
  })
})
