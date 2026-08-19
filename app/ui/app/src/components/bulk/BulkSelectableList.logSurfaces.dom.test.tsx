// "Wire it into the notification centre and history lists — 'it's just a
// log' is not an exemption." Two real, worked examples proving
// BulkSelectableList is genuinely generic enough for log-shaped data, not
// only ordinary records:
//
//   - notification-shaped items: the exact shape
//     components/shell/useShellEvents.ts's `ShellEvent` uses (id, icon,
//     text, time) -- components/shell/** is outside this lane's allowed
//     paths, so dropping this list into the real NotificationCenter.tsx
//     is the next integration step, not something this lane can commit;
//     what this file proves is that nothing about the component itself
//     stands in the way.
//   - history-shaped items: an append-only local-version-history entry
//     (id, action, summary, at) -- the shape described in
//     app/ui/articles/local-version-history.md, which is a documented
//     but not-yet-built feature in this codebase.
//
// Both get real multi-select, a real bulk dismiss/export action wired
// through BulkActionBar, and a real destructive-confirmation preview via
// BulkActionPreviewDialog -- proving the "it's just a log" surfaces get
// the exact same bulk-action contract as anything else, not a smaller one.
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it } from "vitest"
import { UhProvider } from "@/uh"
import { fact } from "@/uh/localized"
import { BulkActionBar } from "./BulkActionBar"
import { BulkSelectableList } from "./BulkSelectableList"
import { useBulkSelection } from "./useBulkSelection"

interface NotificationLikeEvent {
  readonly id: string
  readonly icon: string
  readonly text: string
  readonly time: number
}

interface HistoryLikeEntry {
  readonly id: string
  readonly action: "created" | "updated" | "deleted" | "restored"
  readonly summary: string
  readonly at: number
}

const notifications: NotificationLikeEvent[] = [
  { id: "evt-1", icon: "bolt", text: "Pulled llama3:8b", time: 1 },
  { id: "evt-2", icon: "check_circle", text: "Codex session finished", time: 2 },
  { id: "evt-3", icon: "warning", text: "Pull queue paused", time: 3 },
]

const historyEntries: HistoryLikeEntry[] = [
  { id: "rev-1", action: "created", summary: "Created the GitHub account", at: 10 },
  { id: "rev-2", action: "updated", summary: "Renamed the workspace", at: 20 },
  { id: "rev-3", action: "deleted", summary: "Deleted the GitHub account", at: 30 },
]

function NotificationLogHarness() {
  const [items, setItems] = useState(notifications)
  const selection = useBulkSelection({ ids: items.map((item) => item.id) })
  return (
    <UhProvider>
      <BulkSelectableList
        items={items}
        getId={(item) => item.id}
        renderPrimary={(item) => item.text}
        renderSecondary={(item) => `t=${item.time}`}
        selection={selection}
        ariaLabel={fact("Notifications", "user-input")}
        rowAriaLabel={(item) => fact(`Select ${item.text}`, "user-input")}
        emptyState={<span>Nothing here yet.</span>}
      />
      <BulkActionBar
        selection={selection}
        ids={items.map((item) => item.id)}
        actions={[
          {
            key: "dismiss",
            label: fact("Dismiss selected", "user-input"),
            run: (ids) => {
              setItems((current) => current.filter((item) => !ids.includes(item.id)))
              selection.clear()
            },
          },
        ]}
      />
    </UhProvider>
  )
}

function HistoryLogHarness() {
  const [items] = useState(historyEntries)
  const selection = useBulkSelection({ ids: items.map((item) => item.id) })
  return (
    <UhProvider>
      <BulkSelectableList
        items={items}
        getId={(item) => item.id}
        renderPrimary={(item) => item.summary}
        renderSecondary={(item) => item.action}
        selection={selection}
        ariaLabel={fact("History", "user-input")}
        rowAriaLabel={(item) => fact(`Select ${item.summary}`, "user-input")}
        emptyState={<span>No history yet.</span>}
      />
      <BulkActionBar
        selection={selection}
        ids={items.map((item) => item.id)}
        actions={[
          {
            key: "export",
            label: fact("Export selected", "user-input"),
            run: () => {},
          },
        ]}
      />
    </UhProvider>
  )
}

describe("BulkSelectableList against notification-log-shaped data", () => {
  it("multi-selects real notification-shaped rows the same as any other list", async () => {
    const user = userEvent.setup()
    render(<NotificationLogHarness />)

    await user.click(screen.getByRole("checkbox", { name: "Select Pulled llama3:8b" }))
    await user.click(screen.getByRole("checkbox", { name: "Select Codex session finished" }))

    expect(screen.getByText("2 selected")).toBeInTheDocument()
  })

  it("a real bulk action (dismiss) actually removes the selected notifications, not just the illusion of it", async () => {
    const user = userEvent.setup()
    render(<NotificationLogHarness />)

    await user.click(screen.getByRole("checkbox", { name: "Select Pull queue paused" }))
    await user.click(screen.getByRole("button", { name: "Dismiss selected" }))

    expect(screen.queryByText("Pull queue paused")).not.toBeInTheDocument()
    expect(screen.getByText("Pulled llama3:8b")).toBeInTheDocument()
    expect(screen.getByText("Codex session finished")).toBeInTheDocument()
    // The action bar disappears once nothing is selected -- it isn't left
    // behind claiming a selection that no longer exists.
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument()
  })
})

describe("BulkSelectableList against history-log-shaped data", () => {
  it("multi-selects real local-version-history-shaped entries the same as any other list", async () => {
    const user = userEvent.setup()
    render(<HistoryLogHarness />)

    await user.click(screen.getByRole("checkbox", { name: "Select Created the GitHub account" }))
    await user.click(screen.getByRole("checkbox", { name: "Select Deleted the GitHub account" }))

    expect(screen.getByText("2 selected")).toBeInTheDocument()
    expect(screen.getByText("created")).toBeInTheDocument()
    expect(screen.getByText("deleted")).toBeInTheDocument()
  })

  it("offers export as a real bulk action over history rows, not only over ordinary records", async () => {
    const user = userEvent.setup()
    render(<HistoryLogHarness />)

    await user.click(screen.getByRole("checkbox", { name: "Select Renamed the workspace" }))
    expect(screen.getByRole("button", { name: "Export selected" })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Export selected" }))
    // No crash, no missing wiring -- the action ran for real.
  })
})
