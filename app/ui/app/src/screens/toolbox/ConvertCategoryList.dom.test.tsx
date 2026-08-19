import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { UhProvider } from "@/uh"
import { ConvertCategoryList } from "./ConvertCategoryList"
import type { ConvertCategory } from "./convertApi"

// The file-converter catalog's core honesty contract: an unavailable
// format is never hidden. It stays in the list, disabled, showing the
// exact missing dependency and the exact path this build looked for it
// at -- proven here against a category shaped exactly like convert.go's
// real "documents" category (pdf/txt available in-process; docx/xlsx/pptx
// backed by an external "pandoc" tool this build doesn't ship).
const CATEGORY: ConvertCategory = {
  id: "documents",
  label: "Documents/PDF",
  formats: [
    {
      id: "pdf",
      label: "PDF (text extraction only)",
      extensions: [".pdf"],
      mimeTypes: ["application/pdf"],
      available: true,
    },
    {
      id: "docx",
      label: "Word document (.docx)",
      extensions: [".docx"],
      mimeTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      available: false,
      missingDependency: "pandoc",
      expectedPath: "C:\\Program Files\\Ollama\\lib\\converters\\pandoc.exe",
    },
  ],
}

function renderList() {
  const onSelectFormat = vi.fn()
  render(
    <UhProvider>
      <ConvertCategoryList category={CATEGORY} onSelectFormat={onSelectFormat} sourceFormatId="txt" pickable />
    </UhProvider>,
  )
  return { onSelectFormat }
}

describe("ConvertCategoryList", () => {
  it("shows a disabled format's exact missing dependency and expected path, never hiding it", () => {
    renderList()

    // The unavailable format is present in the list...
    expect(screen.getByText("Word document (.docx)")).toBeInTheDocument()
    // ...and names exactly what this build is missing and where it looked.
    expect(screen.getByText(/Not available offline/)).toBeInTheDocument()
    expect(screen.getByText(/pandoc/)).toBeInTheDocument()
    expect(screen.getByText(/pandoc\.exe/)).toBeInTheDocument()
  })

  it("does not let a disabled format be selected", async () => {
    const user = userEvent.setup()
    const { onSelectFormat } = renderList()

    // The disabled row renders as static content (no onClick was wired),
    // so it never carries an interactive role in the first place -- assert
    // that directly rather than only checking the callback never fires.
    const docxLabel = screen.getByText("Word document (.docx)")
    expect(docxLabel.closest("div[role]")).toBeNull()

    await user.click(docxLabel)
    expect(onSelectFormat).not.toHaveBeenCalled()
  })

  it("selects an available format on click", async () => {
    const user = userEvent.setup()
    const { onSelectFormat } = renderList()

    await user.click(screen.getByText("PDF (text extraction only)"))
    expect(onSelectFormat).toHaveBeenCalledWith("pdf")
  })

  it("filters formats by the search field, plain text by default", async () => {
    const user = userEvent.setup()
    renderList()

    const search = screen.getByLabelText(/Search formats — Documents\/PDF/)
    await user.type(search, "docx")

    expect(screen.getByText("Word document (.docx)")).toBeInTheDocument()
    expect(screen.queryByText("PDF (text extraction only)")).not.toBeInTheDocument()
  })

  it("filters formats by regex once the .* toggle is on", async () => {
    const user = userEvent.setup()
    renderList()

    const search = screen.getByLabelText(/Search formats — Documents\/PDF/)
    await user.click(screen.getByTitle("Regex search"))
    // Anchored to the start of the haystack (label + id + extensions), so
    // it matches only the PDF row's label and not "Word document (.docx)".
    await user.type(search, "^PDF")

    expect(screen.getByText("PDF (text extraction only)")).toBeInTheDocument()
    expect(screen.queryByText("Word document (.docx)")).not.toBeInTheDocument()
  })
})
