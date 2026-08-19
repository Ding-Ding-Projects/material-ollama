import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useBulkSelection } from "./useBulkSelection"

const ids = ["a", "b", "c", "d", "e"]

describe("useBulkSelection", () => {
  it("starts with nothing selected", () => {
    const { result } = renderHook(() => useBulkSelection({ ids }))
    expect(result.current.scope).toBe("none")
    expect(result.current.count).toBe(0)
    expect(ids.every((id) => !result.current.isSelected(id))).toBe(true)
  })

  it("toggle() selects and deselects one id at a time", () => {
    const { result } = renderHook(() => useBulkSelection({ ids }))
    act(() => result.current.toggle("b"))
    expect(result.current.isSelected("b")).toBe(true)
    expect(result.current.count).toBe(1)

    act(() => result.current.toggle("b"))
    expect(result.current.isSelected("b")).toBe(false)
    expect(result.current.count).toBe(0)
  })

  it("toggleRange() (shift-click) selects the whole inclusive range from the last toggle", () => {
    const { result } = renderHook(() => useBulkSelection({ ids }))
    act(() => result.current.toggle("b"))
    act(() => result.current.toggleRange("d"))

    expect(result.current.isSelected("a")).toBe(false)
    expect(result.current.isSelected("b")).toBe(true)
    expect(result.current.isSelected("c")).toBe(true)
    expect(result.current.isSelected("d")).toBe(true)
    expect(result.current.isSelected("e")).toBe(false)
    expect(result.current.count).toBe(3)
  })

  it("toggleRange() extends correctly regardless of click direction (anchor after target)", () => {
    const { result } = renderHook(() => useBulkSelection({ ids }))
    act(() => result.current.toggle("d"))
    act(() => result.current.toggleRange("b"))

    expect(result.current.isSelected("b")).toBe(true)
    expect(result.current.isSelected("c")).toBe(true)
    expect(result.current.isSelected("d")).toBe(true)
    expect(result.current.count).toBe(3)
  })

  it("selectPage() labels itself distinctly from selectAllMatching() when there's more than one page", () => {
    const { result } = renderHook(() => useBulkSelection({ ids, totalMatchCount: 40 }))
    expect(result.current.hasMoreThanLoaded).toBe(true)

    act(() => result.current.selectPage())
    expect(result.current.scope).toBe("page")
    expect(result.current.count).toBe(ids.length)

    act(() => result.current.selectAllMatching())
    expect(result.current.scope).toBe("all")
    expect(result.current.count).toBe(40)
  })

  it("hasMoreThanLoaded is false once the entire result set is loaded, so only one select-all makes sense", () => {
    const { result } = renderHook(() => useBulkSelection({ ids, totalMatchCount: ids.length }))
    expect(result.current.hasMoreThanLoaded).toBe(false)
  })

  it("deselecting one id out of a page selection keeps the count exact", () => {
    const { result } = renderHook(() => useBulkSelection({ ids }))
    act(() => result.current.selectPage())
    act(() => result.current.toggle("c"))

    expect(result.current.isSelected("c")).toBe(false)
    expect(result.current.isSelected("a")).toBe(true)
    expect(result.current.count).toBe(ids.length - 1)
  })

  it("deselecting one id out of an all-matching selection keeps the count exact, beyond the loaded page", () => {
    const { result } = renderHook(() => useBulkSelection({ ids, totalMatchCount: 400 }))
    act(() => result.current.selectAllMatching())
    act(() => result.current.toggle("b"))

    expect(result.current.count).toBe(399)
    expect(result.current.isSelected("b")).toBe(false)
    // An id that was never even loaded is still honestly reported as
    // selected -- "all matching" really does mean all matching.
    expect(result.current.isSelected("not-loaded-id-9000")).toBe(true)
  })

  it("clear() resets scope, selection and exclusions from any starting state", () => {
    const { result } = renderHook(() => useBulkSelection({ ids, totalMatchCount: 400 }))
    act(() => result.current.selectAllMatching())
    act(() => result.current.toggle("b"))
    act(() => result.current.clear())

    expect(result.current.scope).toBe("none")
    expect(result.current.count).toBe(0)
    expect(result.current.isSelected("b")).toBe(false)
  })

  it("invert() produces exactly the complement of the prior selection, for every id in the known universe", () => {
    const { result } = renderHook(() => useBulkSelection({ ids }))
    act(() => result.current.toggle("a"))
    act(() => result.current.toggleRange("c")) // a, b, c selected

    const before = new Map(ids.map((id) => [id, result.current.isSelected(id)]))
    act(() => result.current.invert())

    for (const id of ids) {
      expect(result.current.isSelected(id)).toBe(!before.get(id))
    }
    // a, b, c were selected before (3 of 5) -> d, e selected after (2 of 5).
    expect(result.current.count).toBe(2)
  })

  it("invert() on an empty selection selects everything, and inverting again returns to empty", () => {
    const { result } = renderHook(() => useBulkSelection({ ids }))
    act(() => result.current.invert())
    expect(ids.every((id) => result.current.isSelected(id))).toBe(true)
    expect(result.current.count).toBe(ids.length)

    act(() => result.current.invert())
    expect(ids.every((id) => !result.current.isSelected(id))).toBe(true)
    expect(result.current.count).toBe(0)
  })

  it("invert() from a page-scope selection (with an exclusion) also matches the exact complement", () => {
    const { result } = renderHook(() => useBulkSelection({ ids }))
    act(() => result.current.selectPage())
    act(() => result.current.toggle("c")) // everyone except "c"

    const before = new Map(ids.map((id) => [id, result.current.isSelected(id)]))
    act(() => result.current.invert())

    for (const id of ids) {
      expect(result.current.isSelected(id)).toBe(!before.get(id))
    }
    // Only "c" was excluded before -> only "c" is selected after.
    expect(result.current.isSelected("c")).toBe(true)
    expect(result.current.count).toBe(1)
  })
})
