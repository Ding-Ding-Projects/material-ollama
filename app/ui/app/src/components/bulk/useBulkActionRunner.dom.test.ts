import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useBulkActionRunner } from "./useBulkActionRunner"

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe("useBulkActionRunner", () => {
  it("starts idle with no summary", () => {
    const { result } = renderHook(() => useBulkActionRunner())
    expect(result.current.status).toBe("idle")
    expect(result.current.summary).toBeNull()
  })

  it("reports progress after each item settles, and a real summary of what succeeded", async () => {
    const { result } = renderHook(() => useBulkActionRunner())

    let summary
    await act(async () => {
      summary = await result.current.run(["a", "b", "c"], async () => {
        // resolves immediately -- this test is about the bookkeeping,
        // not about timing.
      })
    })

    expect(result.current.status).toBe("done")
    expect(result.current.processedCount).toBe(3)
    expect(result.current.total).toBe(3)
    expect(summary).toEqual({
      results: [
        { id: "a", outcome: "succeeded" },
        { id: "b", outcome: "succeeded" },
        { id: "c", outcome: "succeeded" },
      ],
      succeededCount: 3,
      failedCount: 0,
      cancelledCount: 0,
    })
  })

  it("states a partial outcome honestly -- one real failure never turns the whole batch red or green", async () => {
    const { result } = renderHook(() => useBulkActionRunner())

    let summary
    await act(async () => {
      summary = await result.current.run(["a", "b", "c"], async (id) => {
        if (id === "b") throw new Error("boom")
      })
    })

    expect(summary).toMatchObject({
      succeededCount: 2,
      failedCount: 1,
      cancelledCount: 0,
    })
    expect(summary!.results.find((r) => r.id === "b")).toMatchObject({ outcome: "failed", error: "boom" })
    // "a" and "c" still ran and succeeded -- one failure didn't abort the batch.
    expect(summary!.results.find((r) => r.id === "a")?.outcome).toBe("succeeded")
    expect(summary!.results.find((r) => r.id === "c")?.outcome).toBe("succeeded")
  })

  it("cancel() lets the in-flight item finish, then marks every remaining item cancelled -- never aborted mid-write", async () => {
    const { result } = renderHook(() => useBulkActionRunner())
    const gate = deferred<void>()
    const started: string[] = []

    const runPromise = act(async () => {
      const summaryPromise = result.current.run(["a", "b", "c", "d"], async (id) => {
        started.push(id)
        if (id === "a") await gate.promise // hold "a" in flight
      })
      // Cancel while "a" is still running.
      await Promise.resolve()
      result.current.cancel()
      gate.resolve()
      return summaryPromise
    })

    const summary = await runPromise
    expect(summary).toMatchObject({ succeededCount: 1, cancelledCount: 3, failedCount: 0 })
    expect(summary!.results[0]).toMatchObject({ id: "a", outcome: "succeeded" })
    expect(summary!.results.slice(1).every((r) => r.outcome === "cancelled")).toBe(true)
    // Only "a" ever actually started -- b/c/d were never invoked at all,
    // not merely marked cancelled after running.
    expect(started).toEqual(["a"])
  })

  it("reset() clears status, progress and summary back to idle", async () => {
    const { result } = renderHook(() => useBulkActionRunner())
    await act(async () => {
      await result.current.run(["a"], async () => {})
    })
    expect(result.current.status).toBe("done")

    act(() => result.current.reset())
    expect(result.current.status).toBe("idle")
    expect(result.current.processedCount).toBe(0)
    expect(result.current.total).toBe(0)
    expect(result.current.summary).toBeNull()
    expect(result.current.cancelled).toBe(false)
  })

  it("runs a second batch cleanly after the first one finished, with fresh progress", async () => {
    const { result } = renderHook(() => useBulkActionRunner())
    await act(async () => {
      await result.current.run(["a", "b"], async () => {})
    })
    expect(result.current.total).toBe(2)

    await act(async () => {
      await result.current.run(["x", "y", "z"], async () => {})
    })
    expect(result.current.total).toBe(3)
    expect(result.current.processedCount).toBe(3)
    expect(result.current.summary?.succeededCount).toBe(3)
  })
})
