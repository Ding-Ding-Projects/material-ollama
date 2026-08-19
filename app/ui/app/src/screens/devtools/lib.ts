import { useMemo } from "react"
import type { Tone } from "@/components/md3"
import type { ConfigurationSource } from "@/lib/cli-config"

export interface TextFilter {
  /** True when `haystack` should be shown under the current query/mode. */
  test: (haystack: string) => boolean
  /** Set when regex mode is on and the pattern fails to compile — callers
   * show this instead of (mis)treating an unparsable pattern as "match
   * nothing forever" without explanation. */
  error: boolean
}

/**
 * Plain-substring-by-default, explicit-opt-in-regex filtering — the exact
 * contract every search bar in this app owes: plain text is the default,
 * regex is optional, and an invalid pattern is reported rather than
 * silently swallowed. Shared by the command search and the configuration
 * search below rather than re-implemented per panel.
 */
export function useTextFilter(query: string, regexMode: boolean): TextFilter {
  return useMemo(() => {
    const trimmed = query.trim()
    if (trimmed === "") {
      return { test: () => true, error: false }
    }
    if (!regexMode) {
      const needle = trimmed.toLowerCase()
      return { test: (haystack: string) => haystack.toLowerCase().includes(needle), error: false }
    }
    try {
      const pattern = new RegExp(trimmed, "iu")
      return { test: (haystack: string) => pattern.test(haystack), error: false }
    } catch {
      return { test: () => false, error: true }
    }
  }, [query, regexMode])
}

/** The one GUIRoute prefix this build can actually route to today. Kept as
 * a literal (not a computed union) so it matches the router's own
 * registered-path type without hand-rolling that type here.
 *
 * The backend's commandGUIRoute() (app/ui/capabilities.go) hands back nine
 * different prefixes: "chat/run", "models"(+5 sub-paths), "service",
 * "account", and "commands/…"/"developer/commands/…" for everything else.
 * Of those, only the "models" family names a screen this router actually
 * has (see src/components/shell/destinations.ts and src/routes/models.tsx)
 * — "chat/run" is not the same as this app's "/c/$chatId" chat screen, and
 * "service"/"account"/"commands"/"developer" have no route at all. This
 * check is deliberately narrow rather than testing against every known
 * top-level destination: CommandRow below always links to MODELS_ROUTE, so
 * a broader check here would let a future backend prefix (say "settings/x")
 * read as "routed" while still linking to the wrong screen. Widen both
 * together, never just this check.
 */
export const MODELS_ROUTE = "/models" as const

/** Whether `guiRoute` (e.g. "models", "models/transfer", "service") names
 * the one screen this build actually renders a link to. */
export function isRoutedGuiRoute(guiRoute: string): boolean {
  const first = guiRoute.split("/")[0]
  return first === "models"
}

export const SOURCE_TONE: Record<ConfigurationSource, Tone> = {
  default: "neutral",
  environment: "tertiary",
  config: "secondary",
  "environment+config": "tonal",
}

export const SOURCE_DICT_KEY: Record<
  ConfigurationSource,
  "sourceDefault" | "sourceEnvironment" | "sourceConfig" | "sourceBoth"
> = {
  default: "sourceDefault",
  environment: "sourceEnvironment",
  config: "sourceConfig",
  "environment+config": "sourceBoth",
}
