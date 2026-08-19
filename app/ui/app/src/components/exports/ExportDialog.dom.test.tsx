import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { UhProvider } from "@/uh"
import type { ExternalEditorBridge } from "./openInEditor"
import type { ExportColumn } from "./exportFormats"

// Same streamdown boundary mock as ExportPreview.dom.test.tsx -- see the
// comment there for why (katex's CSS import can't load under Vitest's
// Node-based runner).
const streamdownMock = vi.hoisted(() => vi.fn((props: { children?: string }) => (
  <div data-testid="streamdown-mock">{props.children}</div>
)))
vi.mock("streamdown", () => ({ Streamdown: streamdownMock }))

import { ExportDialog } from "./ExportDialog"

interface Row {
  id: string
  name: string
  tags: string[]
}

const rows: Row[] = [
  { id: "m1", name: "llama3", tags: ["chat"] },
  { id: "m2", name: "phi4", tags: [] },
]

const columns: ExportColumn<Row>[] = [
  { key: "id", header: "ID", get: (row) => row.id },
  { key: "name", header: "Name", get: (row) => row.name },
  { key: "tags", header: "Tags", get: (row) => row.tags },
]

function renderDialog(rowsToUse: Row[] = rows, onClose = vi.fn()) {
  render(
    <UhProvider>
      <ExportDialog open rows={rowsToUse} columns={columns} suggestedName="models" onClose={onClose} />
    </UhProvider>,
  )
  return { onClose }
}

afterEach(() => {
  delete (window as { materialOllamaExternalEditor?: ExternalEditorBridge }).materialOllamaExternalEditor
  vi.unstubAllGlobals()
})

describe("ExportDialog", () => {
  it("opens on JSON by default with no caveats -- the lossless default", async () => {
    renderDialog()
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Export")).toBeInTheDocument()
    expect(screen.getByText(/keeps everything exactly as shown/i)).toBeInTheDocument()
  })

  it("switching to CSV shows the real, computed caveat naming the exact flattened column", async () => {
    const user = userEvent.setup()
    renderDialog()
    await screen.findByRole("dialog")

    await user.selectOptions(screen.getByLabelText("Format"), "csv")

    expect(screen.getByText(/before you export/i)).toBeInTheDocument()
    expect(screen.getByText(/"Tags" holds nested data/)).toBeInTheDocument()
    expect(screen.queryByText(/keeps everything exactly as shown/i)).not.toBeInTheDocument()
  })

  it("switching back to a lossless format clears the caveat", async () => {
    const user = userEvent.setup()
    renderDialog()
    await screen.findByRole("dialog")

    await user.selectOptions(screen.getByLabelText("Format"), "csv")
    expect(screen.getByText(/before you export/i)).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText("Format"), "json")
    expect(screen.queryByText(/before you export/i)).not.toBeInTheDocument()
    expect(screen.getByText(/keeps everything exactly as shown/i)).toBeInTheDocument()
  })

  it("disables Save for an empty list and never triggers a download", async () => {
    const user = userEvent.setup()
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click")
    renderDialog([])
    await screen.findByRole("dialog")

    const saveButton = screen.getByRole("button", { name: "Save file" })
    expect(saveButton).toBeDisabled()
    await user.click(saveButton)
    expect(clickSpy).not.toHaveBeenCalled()
    clickSpy.mockRestore()
  })

  it("Save triggers a real download and then offers the external-editor handoff", async () => {
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:mock"), revokeObjectURL: vi.fn() })
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    const user = userEvent.setup()
    renderDialog()
    await screen.findByRole("dialog")

    await user.click(screen.getByRole("button", { name: "Save file" }))

    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(screen.getByText("models.json")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Open in VS Code" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Copy path" })).toBeInTheDocument()
    clickSpy.mockRestore()
  })

  it("honestly reports the bridge as unavailable rather than pretending VS Code opened", async () => {
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:mock"), revokeObjectURL: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    const user = userEvent.setup()
    renderDialog()
    await screen.findByRole("dialog")

    await user.click(screen.getByRole("button", { name: "Save file" }))
    await user.click(screen.getByRole("button", { name: "Open in VS Code" }))

    expect(await screen.findByText(/isn't wired up in this build yet/i)).toBeInTheDocument()
  })

  it("really launches VS Code through the bridge when one is wired up and installed", async () => {
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:mock"), revokeObjectURL: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    const openPathInVsCode = vi.fn().mockResolvedValue(undefined)
    window.materialOllamaExternalEditor = {
      detectVsCode: vi.fn().mockResolvedValue({ installed: true }),
      openPathInVsCode,
    }
    const user = userEvent.setup()
    renderDialog()
    await screen.findByRole("dialog")

    await user.click(screen.getByRole("button", { name: "Save file" }))
    await user.click(screen.getByRole("button", { name: "Open in VS Code" }))

    expect(openPathInVsCode).toHaveBeenCalledWith("models.json", "file")
    expect(screen.queryByText(/isn't wired up/i)).not.toBeInTheDocument()
  })

  it("copies the saved filename to the clipboard as the always-available fallback", async () => {
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:mock"), revokeObjectURL: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    // Applied AFTER userEvent.setup() -- user-event installs its own
    // navigator.clipboard stub during setup(), which would otherwise win.
    // Object.assign can't shadow navigator.clipboard once jsdom has
    // already vended it as a getter-only accessor -- defineProperty
    // forcibly replaces it with a plain, writable-again data property.
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
    renderDialog()
    await screen.findByRole("dialog")

    await user.click(screen.getByRole("button", { name: "Save file" }))
    await user.click(screen.getByRole("button", { name: "Copy path" }))

    expect(writeText).toHaveBeenCalledWith("models.json")
    expect(await screen.findByText("Path copied")).toBeInTheDocument()
  })

  it("Cancel closes without ever calling save()", async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click")
    const user = userEvent.setup()
    const { onClose } = renderDialog()
    await screen.findByRole("dialog")

    await user.click(screen.getByRole("button", { name: "Cancel" }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(clickSpy).not.toHaveBeenCalled()
    clickSpy.mockRestore()
  })
})
