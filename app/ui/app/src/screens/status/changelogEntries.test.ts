import { describe, expect, it } from "vitest"
import { CHANGELOG_ENTRIES, CHANGELOG_REPO_URL, commitUrl, shortSha } from "./changelogEntries"

const FULL_SHA = /^[0-9a-f]{40}$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

describe("CHANGELOG_ENTRIES", () => {
  it("is non-empty", () => {
    expect(CHANGELOG_ENTRIES.length).toBeGreaterThan(0)
  })

  it("every entry has a real full 40-character SHA and a real ISO date", () => {
    for (const entry of CHANGELOG_ENTRIES) {
      expect(entry.sha).toMatch(FULL_SHA)
      expect(entry.date).toMatch(ISO_DATE)
      expect(entry.subject.length).toBeGreaterThan(0)
    }
  })

  it("carries no two entries with the same SHA", () => {
    const seen = new Set(CHANGELOG_ENTRIES.map((entry) => entry.sha))
    expect(seen.size).toBe(CHANGELOG_ENTRIES.length)
  })

  it("is sorted newest first, matching `git log`'s own order", () => {
    for (let i = 1; i < CHANGELOG_ENTRIES.length; i += 1) {
      const previous = CHANGELOG_ENTRIES[i - 1]?.date ?? ""
      const current = CHANGELOG_ENTRIES[i]?.date ?? ""
      expect(previous >= current).toBe(true)
    }
  })
})

describe("commitUrl", () => {
  it("builds a real GitHub commit URL under this repository", () => {
    const sha = CHANGELOG_ENTRIES[0]?.sha ?? ""
    expect(commitUrl(sha)).toBe(`${CHANGELOG_REPO_URL}/commit/${sha}`)
    expect(commitUrl(sha)).toMatch(/^https:\/\/github\.com\/.+\/commit\/[0-9a-f]{40}$/)
  })
})

describe("shortSha", () => {
  it("truncates to the first 8 characters", () => {
    expect(shortSha("e9fe509c3a2906b80ae33561962e94194a9930b9")).toBe("e9fe509c")
  })
})
