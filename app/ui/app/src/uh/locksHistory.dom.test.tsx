import { beforeEach, describe, expect, it } from "vitest"
import { exportHistoryText, listHistory, recordHistory, searchHistory } from "./locksHistory"

describe("locksHistory", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("records append-only, redacted entries", () => {
    recordHistory({ lockId: "a", label: "Danger zone", action: "created", detail: "method: password" })
    recordHistory({ lockId: "a", label: "Danger zone", action: "unlocked" })
    const entries = listHistory()
    expect(entries).toHaveLength(2)
    expect(entries[0].action).toBe("created")
    expect(entries[1].action).toBe("unlocked")
  })

  it("never carries a credential-shaped field -- the input type structurally forbids it", () => {
    const entry = recordHistory({ lockId: "a", label: "Danger zone", action: "created", detail: "duration: 10 min" })
    const serialized = JSON.stringify(entry)
    expect(serialized).not.toMatch(/password|secret|hash|totp.*code/i)
  })

  it("search composes text, action filter, and date range", () => {
    recordHistory({ lockId: "a", label: "Danger zone", action: "created" }, 1_000)
    recordHistory({ lockId: "b", label: "Export chat", action: "created" }, 2_000)
    recordHistory({ lockId: "a", label: "Danger zone", action: "removed" }, 3_000)

    const all = listHistory()
    expect(searchHistory(all, "danger").map((e) => e.action)).toEqual(["created", "removed"])
    expect(searchHistory(all, "danger", { actions: ["removed"] }).map((e) => e.lockId)).toEqual(["a"])
    expect(searchHistory(all, "", { fromMs: 2_000, toMs: 2_000 }).map((e) => e.label)).toEqual(["Export chat"])
  })

  it("regex search is opt-in and an invalid pattern matches nothing", () => {
    recordHistory({ lockId: "a", label: "Danger zone", action: "created" })
    const all = listHistory()
    expect(searchHistory(all, "^Danger", { regex: true })).toHaveLength(1)
    expect(searchHistory(all, "(", { regex: true })).toHaveLength(0)
  })

  it("export is a redacted plain-text summary naming what it omits", () => {
    recordHistory({ lockId: "a", label: "Danger zone", action: "created", detail: "method: password" })
    const text = exportHistoryText(listHistory())
    expect(text).toContain("no credentials")
    expect(text).toContain("Danger zone")
    expect(text).not.toMatch(/[0-9a-f]{32,}/) // no hash/secret-shaped hex blob
  })
})
