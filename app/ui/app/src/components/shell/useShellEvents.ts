import { useCallback, useState } from "react"
import type { SymbolName } from "@/components/md3/Icon"
import type { Localized } from "@/uh"

export interface ShellEvent {
  readonly id: string
  readonly icon: SymbolName
  readonly text: Localized
  readonly time: number
}

let eventSeq = 0
const MAX_EVENTS = 30

export interface UseShellEventsResult {
  readonly events: readonly ShellEvent[]
  readonly hasUnread: boolean
  readonly record: (icon: SymbolName, text: Localized) => void
  readonly clearAll: () => void
}

/**
 * The notification center's real (if modest) data source: an in-memory,
 * capped log of real shell actions — a tab pinned, grouped, or closed from
 * its context menu. Nothing here is seeded or faked; an empty inbox is the
 * honest starting state, and "Clear all" genuinely empties it.
 */
export function useShellEvents(): UseShellEventsResult {
  const [events, setEvents] = useState<ShellEvent[]>([])

  const record = useCallback((icon: SymbolName, text: Localized) => {
    eventSeq += 1
    const entry: ShellEvent = { id: `evt-${eventSeq}`, icon, text, time: Date.now() }
    setEvents((current) => [entry, ...current].slice(0, MAX_EVENTS))
  }, [])

  const clearAll = useCallback(() => setEvents([]), [])

  return { events, hasUnread: events.length > 0, record, clearAll }
}
