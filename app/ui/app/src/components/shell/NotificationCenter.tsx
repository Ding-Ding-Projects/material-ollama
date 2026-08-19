import { Badge, Popover } from "@/components/md3"
import { Icon } from "@/components/md3/Icon"
import { Txt, useT } from "@/uh"
import type { ShellEvent } from "./useShellEvents"
import "./shell.dict"

export interface NotificationCenterProps {
  events: readonly ShellEvent[]
  hasUnread: boolean
  onClearAll: () => void
}

// Matches the design's own `ago()` helper — a relative-time format, not
// translatable UI prose, so it never goes through t(); it reaches Localized
// sinks via the fact() escape hatch (kind "timestamp") instead.
function formatAgo(atMs: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - atMs) / 1000))
  if (seconds < 60) return "now"
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

/** The bell's popover: real events, a real (if small) "Clear all" bulk
 * action, and an honest empty state when there is genuinely nothing yet. */
export function NotificationCenter({ events, hasUnread, onClearAll }: NotificationCenterProps) {
  const t = useT("app")
  const tShell = useT("shell")

  return (
    <Popover
      anchor="bottom end"
      triggerLabel={t("notifications")}
      trigger={
        <span className="relative inline-flex h-5 w-5 items-center justify-center">
          <Icon name="notifications" size={20} />
          {hasUnread ? (
            <span className="absolute -top-1 -right-1">
              <Badge variant="dot" tone="error" label={tShell("unread")} />
            </span>
          ) : null}
        </span>
      }
      triggerClassName="h-9 w-9 items-center justify-center rounded-full border-none px-0 py-0 text-on-surface-variant"
      className="flex max-h-[70vh] w-[340px] flex-col gap-0 p-0"
    >
      <div className="flex items-center gap-2 border-b border-outline-variant px-4 py-3">
        <span className="flex-1 text-sm font-semibold">
          <Txt ns="app" k="notifications" channel="copy" />
        </span>
        <button type="button" onClick={onClearAll} className="text-xs font-medium text-primary">
          <Txt ns="app" k="clearAll" channel="copy" />
        </button>
      </div>
      <div className="flex flex-col gap-1 overflow-y-auto p-2">
        {events.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13px] text-outline">
            <Txt ns="app" k="noNotifs" channel="copy" />
          </p>
        ) : (
          events.map((event) => (
            <div key={event.id} className="flex gap-2.5 rounded-xl bg-surface-low px-3 py-2.5">
              <Icon name={event.icon} size={18} className="mt-0.5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-snug text-on-surface">{event.text}</p>
                <p className="mt-0.5 text-[11px] text-outline">
                  <Txt channel="fact" value={formatAgo(event.time)} kind="timestamp" />
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </Popover>
  )
}
