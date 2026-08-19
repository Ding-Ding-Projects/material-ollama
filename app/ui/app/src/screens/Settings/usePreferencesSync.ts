import { useCallback, useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { PREFERENCES_CHANGED_EVENT, PREFERENCES_STORAGE_KEY } from "@/uh"
import { getUIPreferences, patchUIPreferences } from "./api"
import { DEFAULT_UI_PREFERENCES, type UIPreferences } from "./types"

const QUERY_KEY = ["uh", "preferences"] as const

/**
 * Mirrors a fetched/patched `UIPreferences` document into the shape
 * `src/uh/provider.tsx`'s `useUh()` reads from `localStorage`, and fires
 * the event that makes it pick the change up live with no reload.
 *
 * `provider.tsx` says it plainly: "A sibling lane is adding the real
 * (Go-backed) settings store... Whatever eventually writes real
 * preferences here should keep this key and dispatch that event after
 * writing so this provider picks the change up live." This is that lane —
 * every fetch and every successful patch below re-mirrors, so the title
 * bar's School badge, every `<Txt channel="copy">`'s funny-level styling,
 * the dialog-emoji toggle and personal vocabulary all update the instant
 * this screen changes them, everywhere in the app, not just here.
 */
function mirrorToLiveVoice(prefs: UIPreferences): void {
  if (typeof window === "undefined") return
  const shape = {
    langMode: prefs.langMode,
    funnyEn: prefs.funnyEn,
    funnyYue: prefs.funnyYue,
    emoji: prefs.emoji,
    school: { on: prefs.school.on },
    // provider.tsx's sanitizeVocab() expects {find, replace}; the Go side
    // (app/store/store.go's VocabRule) tags the field `repl`. Bridging that
    // mismatch here is this hook's job, not provider.tsx's (out of this
    // lane's allowed paths) or the server's (a shipped JSON contract).
    vocab: (prefs.vocab ?? []).map((rule) => ({ find: rule.find, replace: rule.repl })),
  }
  try {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(shape))
  } catch {
    // Storage disabled or full — the in-memory value still renders
    // correctly for this session; only the cross-consumer mirror is lost.
  }
  window.dispatchEvent(new Event(PREFERENCES_CHANGED_EVENT))
}

export interface UsePreferencesSyncResult {
  preferences: UIPreferences
  isLoading: boolean
  loadFailed: boolean
  isSaving: boolean
  /** Partial patch — only the fields present are changed server-side (see
   * uhPatchPreferences's read-modify-write merge); everything else keeps
   * its previously-saved value. */
  patch: (partial: Partial<UIPreferences>) => void
}

export function usePreferencesSync(): UsePreferencesSyncResult {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: getUIPreferences,
  })

  const preferences = query.data ?? DEFAULT_UI_PREFERENCES

  // Re-mirror on every value this hook resolves to, whether that came from
  // the initial GET or a later PATCH's response (see the mutation below,
  // which also writes straight into this same query's cache).
  useEffect(() => {
    if (query.data) mirrorToLiveVoice(query.data)
  }, [query.data])

  const mutation = useMutation({
    mutationFn: patchUIPreferences,
    onSuccess: (updated) => {
      queryClient.setQueryData(QUERY_KEY, updated)
    },
  })

  const patch = useCallback(
    (partial: Partial<UIPreferences>) => mutation.mutate(partial),
    [mutation],
  )

  return {
    preferences,
    isLoading: query.isLoading,
    loadFailed: query.isError,
    isSaving: mutation.isPending,
    patch,
  }
}
