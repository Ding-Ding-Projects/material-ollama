# Notification Center

## Behaviour

`app/ui/app/src/components/shell/useShellEvents.ts` is a real, if modest, in-memory event log: `record(icon, text)` prepends a timestamped entry to a capped 30-item list, and `NotificationCenter.tsx` (opened from the app shell's bell icon) renders that list with a "Clear all" action and an honest empty "No notifications" state -- nothing is seeded or faked, matching the module's own comment that "an empty inbox is the honest starting state." `AppShell.tsx` wires real shell actions into it today: pinning, grouping, or closing a tab from its context menu each calls `record()` with a localized description of what happened.

The log is entirely in-memory (`useState`, no localStorage, no backend endpoint), so it resets to empty on every restart -- there is no durable notification history yet, and no dedicated review/history panel beyond the shell's own dropdown.

## Configuration

TODO(notification-center): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(notification-center): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(notification-center): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(notification-center): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(notification-center): link the related features, the prerequisites, and the natural next article a reader should open.
