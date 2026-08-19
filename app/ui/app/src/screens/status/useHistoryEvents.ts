import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { appendHistoryEvent, getHistoryEvents, type AppendHistoryRequest } from "./api"
import type { AppEvent } from "./types"

const HISTORY_QUERY_KEY = ["status", "history"] as const

/** The append-only local version-history list -- app_events, schema v18.
 * Unlike release info this table can genuinely change (another feature
 * elsewhere in the app appends to it, or this screen's own "record a
 * checkpoint" action does), so it stays on the query client's normal
 * default staleness rather than pinning `Infinity`. */
export function useHistoryEvents() {
  return useQuery<AppEvent[], Error>({
    queryKey: [...HISTORY_QUERY_KEY],
    queryFn: getHistoryEvents,
  })
}

/** Records one new checkpoint and refetches the list so it shows up
 * immediately -- a genuine round trip through POST /api/v1/history rather
 * than an optimistic client-side splice, so the rendered list always
 * matches what the server actually persisted. */
export function useAppendHistoryEvent() {
  const queryClient = useQueryClient()
  return useMutation<AppEvent, Error, AppendHistoryRequest>({
    mutationFn: appendHistoryEvent,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...HISTORY_QUERY_KEY] })
    },
  })
}
