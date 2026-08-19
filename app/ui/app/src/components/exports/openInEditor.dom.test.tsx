import { afterEach, describe, expect, it, vi } from "vitest"
import {
  copyPathToClipboard,
  detectExternalEditor,
  openInExternalEditor,
  type ExternalEditorBridge,
} from "./openInEditor"

afterEach(() => {
  delete (window as { materialOllamaExternalEditor?: ExternalEditorBridge }).materialOllamaExternalEditor
  vi.restoreAllMocks()
})

describe("detectExternalEditor", () => {
  it("honestly reports bridge-unavailable rather than \"not installed\" when no bridge is wired up", async () => {
    expect(await detectExternalEditor()).toEqual({ state: "bridge-unavailable" })
  })

  it("reports installed with the real path when the bridge finds VS Code", async () => {
    window.materialOllamaExternalEditor = {
      detectVsCode: vi.fn().mockResolvedValue({ installed: true, path: "C:/vscode/bin/code.cmd" }),
    }
    expect(await detectExternalEditor()).toEqual({ state: "installed", path: "C:/vscode/bin/code.cmd" })
  })

  it("reports not-installed when the bridge genuinely finds nothing", async () => {
    window.materialOllamaExternalEditor = {
      detectVsCode: vi.fn().mockResolvedValue({ installed: false }),
    }
    expect(await detectExternalEditor()).toEqual({ state: "not-installed" })
  })

  it("treats a throwing bridge as bridge-unavailable, never a false not-installed claim", async () => {
    window.materialOllamaExternalEditor = {
      detectVsCode: vi.fn().mockRejectedValue(new Error("ipc exploded")),
    }
    expect(await detectExternalEditor()).toEqual({ state: "bridge-unavailable" })
  })
})

describe("openInExternalEditor", () => {
  it("fails honestly with bridge-unavailable and never calls anything when there is no bridge", async () => {
    const outcome = await openInExternalEditor({ path: "C:/exports/models.csv", kind: "file" })
    expect(outcome).toEqual({ ok: false, reason: "bridge-unavailable" })
  })

  it("fails with not-installed and never attempts to launch when detection says VS Code is absent", async () => {
    const openPathInVsCode = vi.fn()
    window.materialOllamaExternalEditor = {
      detectVsCode: vi.fn().mockResolvedValue({ installed: false }),
      openPathInVsCode,
    }
    const outcome = await openInExternalEditor({ path: "C:/exports/models.csv", kind: "file" })
    expect(outcome).toEqual({ ok: false, reason: "not-installed" })
    expect(openPathInVsCode).not.toHaveBeenCalled()
  })

  it("really launches with the exact path and kind when VS Code is detected", async () => {
    const openPathInVsCode = vi.fn().mockResolvedValue(undefined)
    window.materialOllamaExternalEditor = {
      detectVsCode: vi.fn().mockResolvedValue({ installed: true, path: "/usr/bin/code" }),
      openPathInVsCode,
    }
    const outcome = await openInExternalEditor({ path: "/home/user/exports/models.csv", kind: "file" })
    expect(outcome).toEqual({ ok: true })
    expect(openPathInVsCode).toHaveBeenCalledWith("/home/user/exports/models.csv", "file")
  })

  it("reports launch-failed with the real error detail rather than throwing out of the caller", async () => {
    window.materialOllamaExternalEditor = {
      detectVsCode: vi.fn().mockResolvedValue({ installed: true }),
      openPathInVsCode: vi.fn().mockRejectedValue(new Error("spawn ENOENT")),
    }
    const outcome = await openInExternalEditor({ path: "C:/exports", kind: "folder" })
    expect(outcome).toEqual({ ok: false, reason: "launch-failed", detail: "spawn ENOENT" })
  })
})

describe("copyPathToClipboard", () => {
  it("writes the exact path through the real Clipboard API when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    const ok = await copyPathToClipboard("C:/exports/models.csv")
    expect(ok).toBe(true)
    expect(writeText).toHaveBeenCalledWith("C:/exports/models.csv")
  })

  it("returns false rather than throwing when the Clipboard API is unavailable", async () => {
    Object.assign(navigator, { clipboard: undefined })
    expect(await copyPathToClipboard("C:/exports/models.csv")).toBe(false)
  })

  it("returns false rather than throwing when the write itself rejects", async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } })
    expect(await copyPathToClipboard("C:/exports/models.csv")).toBe(false)
  })
})
