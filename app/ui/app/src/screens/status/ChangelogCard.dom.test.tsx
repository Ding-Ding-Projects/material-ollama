import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { UhProvider } from "@/uh"
import { CHANGELOG_ENTRIES, commitUrl } from "./changelogEntries"
import { ChangelogCard } from "./ChangelogCard"

function renderCard() {
  return render(
    <UhProvider>
      <ChangelogCard />
    </UhProvider>,
  )
}

describe("ChangelogCard", () => {
  it("lists every real changelog entry, each linking to its real GitHub commit", () => {
    renderCard()

    const first = CHANGELOG_ENTRIES[0]
    expect(first).toBeDefined()
    if (!first) return

    const link = screen.getByRole("link", { name: new RegExp(first.sha.slice(0, 8)) })
    expect(link).toHaveAttribute("href", commitUrl(first.sha))
    expect(screen.getByText(first.subject)).toBeInTheDocument()

    // The full count text states the real total.
    expect(screen.getByText(new RegExp(`${CHANGELOG_ENTRIES.length} of ${CHANGELOG_ENTRIES.length} commits`))).toBeInTheDocument()
  })

  it("filters commits by a plain-text search over their subjects", async () => {
    const user = userEvent.setup()
    renderCard()

    const target = CHANGELOG_ENTRIES.find((entry) => entry.subject.includes("Squirrel")) ?? CHANGELOG_ENTRIES[0]
    expect(target).toBeDefined()
    if (!target) return
    const needle = target.subject.split(" ").slice(0, 3).join(" ")

    await user.type(screen.getByLabelText("Search the changelog"), needle)

    expect(screen.getByText(target.subject)).toBeInTheDocument()
    const remaining = screen.getAllByRole("listitem")
    expect(remaining.length).toBeLessThan(CHANGELOG_ENTRIES.length)
  })

  it("shows an honest no-matches state for a query nothing satisfies", async () => {
    const user = userEvent.setup()
    renderCard()

    await user.type(screen.getByLabelText("Search the changelog"), "xyzzy-nonexistent-commit-subject")

    expect(screen.getByText("No commits match this search and date range.")).toBeInTheDocument()
  })

  it("filters by date range", async () => {
    const user = userEvent.setup()
    renderCard()

    const onlyDate = "2026-08-15"
    const matching = CHANGELOG_ENTRIES.filter((entry) => entry.date === onlyDate)
    expect(matching.length).toBeGreaterThan(0)

    await user.type(screen.getByLabelText("Date range — From"), onlyDate)
    await user.type(screen.getByLabelText("Date range — To"), onlyDate)

    for (const entry of matching) {
      expect(screen.getByText(entry.subject)).toBeInTheDocument()
    }
    expect(
      screen.getByText(new RegExp(`${matching.length} of ${CHANGELOG_ENTRIES.length} commits`)),
    ).toBeInTheDocument()
  })
})
