import { afterEach, describe, expect, it, vi } from "vitest"
import { downloadJson, exportTimestamp } from "./exportUtils"

// jsdom implements neither Blob object URLs nor real navigation, so both
// are stubbed here -- this proves downloadJson() builds and clicks a real
// `<a download>` with the right filename and JSON payload, not merely
// that it doesn't throw.
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe("downloadJson", () => {
  it("creates an object URL for a JSON blob and clicks a download anchor with the given filename", () => {
    const createObjectURL = vi.fn().mockReturnValue("blob:mock-url")
    const revokeObjectURL = vi.fn()
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL })

    let capturedHref = ""
    let capturedDownload = ""
    let clicked = false
    const realCreateElement = document.createElement.bind(document)
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreateElement(tag)
      if (tag === "a") {
        Object.defineProperty(el, "click", {
          value: () => {
            clicked = true
            capturedHref = (el as HTMLAnchorElement).href
            capturedDownload = (el as HTMLAnchorElement).download
          },
        })
      }
      return el
    })

    downloadJson("status-export.json", { hello: "world" })

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    const blobArg = createObjectURL.mock.calls[0]?.[0] as Blob
    expect(blobArg.type).toBe("application/json;charset=utf-8")
    expect(clicked).toBe(true)
    expect(capturedHref).toBe("blob:mock-url")
    expect(capturedDownload).toBe("status-export.json")
  })

  it("revokes the object URL after a delay rather than immediately", () => {
    vi.useFakeTimers()
    const createObjectURL = vi.fn().mockReturnValue("blob:mock-url")
    const revokeObjectURL = vi.fn()
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL })
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})

    downloadJson("f.json", {})
    expect(revokeObjectURL).not.toHaveBeenCalled()

    vi.advanceTimersByTime(30_000)
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url")
  })
})

describe("exportTimestamp", () => {
  it("returns a real ISO-8601 timestamp", () => {
    const stamp = exportTimestamp()
    expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    expect(new Date(stamp).toISOString()).toBe(stamp)
  })
})
