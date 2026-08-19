import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import { SnackbarProvider } from "@/components/md3"
import { PREFERENCES_STORAGE_KEY, UhProvider, type FunnyLevel, type LangMode } from "@/uh"
import { SupportTicketsCard } from "./SupportTicketsCard"

const EXACT_DISCLOSURE_EN =
  "This is a bit, not a service. Nothing here is sent anywhere. No ticket exists outside this machine. No network request is made. No data is collected. Nobody is reading this."
const EXACT_DISCLOSURE_YUE =
  "呢度純粹整蠱，唔係真服務。呢度嘅嘢一樣都唔會send去邊。冇任何票存在呢部機以外嘅地方。冇任何網絡請求。冇收集任何資料。冇人喺度睇緊。"

function setPreferences(prefs: {
  langMode?: LangMode
  funnyEn?: FunnyLevel
  funnyYue?: FunnyLevel
  emoji?: boolean
}) {
  window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(prefs))
}

function renderCard() {
  return render(
    <UhProvider>
      <SnackbarProvider>
        <SupportTicketsCard />
      </SnackbarProvider>
    </UhProvider>,
  )
}

afterEach(() => {
  window.localStorage.clear()
})

describe("SupportTicketsCard disclosure", () => {
  it.each([0, 1, 2, 3, 4] as FunnyLevel[])(
    "renders the exact English disclosure unchanged at funny level %i",
    (level) => {
      setPreferences({ langMode: "en", funnyEn: level, emoji: true })
      renderCard()

      expect(screen.getByTestId("tickets-disclosure")).toHaveTextContent(EXACT_DISCLOSURE_EN)
    },
  )

  it.each([0, 1, 2, 3, 4] as FunnyLevel[])(
    "renders the exact Cantonese disclosure unchanged at funny level %i",
    (level) => {
      setPreferences({ langMode: "yue", funnyYue: level, emoji: true })
      renderCard()

      expect(screen.getByTestId("tickets-disclosure")).toHaveTextContent(EXACT_DISCLOSURE_YUE)
    },
  )

  it("is identical across every funny level -- proving channel=\"label\" truly skips funny() styling", () => {
    const renderedTexts = new Set<string>()
    for (const level of [0, 1, 2, 3, 4] as FunnyLevel[]) {
      setPreferences({ langMode: "en", funnyEn: level })
      const { unmount } = renderCard()
      renderedTexts.add(screen.getByTestId("tickets-disclosure").textContent ?? "")
      unmount()
    }
    expect(renderedTexts.size).toBe(1)
    expect([...renderedTexts][0]).toBe(EXACT_DISCLOSURE_EN)
  })

  it("stays present and unstyled even in bilingual mode", () => {
    setPreferences({ langMode: "both", funnyEn: 4, funnyYue: 4 })
    renderCard()

    const disclosure = screen.getByTestId("tickets-disclosure")
    // Bilingual mode concatenates en + " · " + yue in t(), but the label
    // channel still never runs funny() over it.
    expect(disclosure).toHaveTextContent(EXACT_DISCLOSURE_EN)
    expect(disclosure).toHaveTextContent(EXACT_DISCLOSURE_YUE)
  })

  it("is hidden from nothing -- School mode still shows the disclosure (it isn't a dim-sum/humour feature)", () => {
    window.localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ school: { on: true } }),
    )
    renderCard()
    expect(screen.getByTestId("tickets-disclosure")).toHaveTextContent(EXACT_DISCLOSURE_EN)
  })
})

describe("SupportTicketsCard ticket flow", () => {
  it("files a ticket, shows the canned response, and moves it to resolved on Resolve", async () => {
    const user = userEvent.setup()
    renderCard()

    await user.type(
      screen.getByLabelText("Describe the problem"),
      "I forgot my own toy-lock PIN, send help",
    )
    await user.click(screen.getByRole("button", { name: "Submit ticket" }))

    expect(await screen.findByText(/I forgot my own toy-lock PIN, send help/)).toBeInTheDocument()
    expect(screen.getByText(/highest possible priority/)).toBeInTheDocument()
    expect(screen.getByText("Open")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Resolve" }))

    expect(screen.getByText("Resolved")).toBeInTheDocument()
    expect(screen.getByText("%LOCALAPPDATA%\\Ollama")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Resolve" })).not.toBeInTheDocument()
  })

  it("does not submit an empty ticket", async () => {
    const user = userEvent.setup()
    renderCard()

    expect(screen.getByRole("button", { name: "Submit ticket" })).toBeDisabled()
    await user.click(screen.getByRole("button", { name: "Submit ticket" }))
    expect(screen.getByText("No tickets filed yet. Lucky you.")).toBeInTheDocument()
  })
})
