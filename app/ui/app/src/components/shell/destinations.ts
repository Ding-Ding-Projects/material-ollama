import type { SymbolName } from "@/components/md3/Icon"

/**
 * The nine primary destinations, one per navigation-rail item and (once
 * open) one per browser-style tab. Mirrors the design prototype's
 * `SCREENS`/`ICONS` tables exactly — icon names below are the ones the
 * icon sprite already ships fill variants for (see FILL_ICON_NAMES in
 * scripts/build-icon-sprite.mjs), which is not a coincidence: they were
 * chosen to match.
 */
export type DestinationId =
  | "models"
  | "chat"
  | "launch"
  | "codex"
  | "devtools"
  | "toolbox"
  | "docs"
  | "status"
  | "settings"

/** The subset of the "app" dictionary namespace's keys used as nav/tab labels. */
export type DestinationLabelKey =
  | "models"
  | "chat"
  | "launchNav"
  | "codex"
  | "devtools"
  | "toolbox"
  | "docs"
  | "status"
  | "settings"

export interface Destination {
  readonly id: DestinationId
  readonly icon: SymbolName
  /** The dictionary key (in the "app" namespace) for this destination's label. */
  readonly labelKey: DestinationLabelKey
  /** The path navigated to when this destination is opened fresh (rail click,
   * palette selection, or reactivating a tab that has no more specific URL
   * of its own). */
  readonly path: string
  /** Whether a given pathname belongs to this destination — the chat screen
   * owns every `/c/*` URL, not just its own canonical `/c/new`. */
  readonly matches: (pathname: string) => boolean
}

export const DESTINATIONS: readonly Destination[] = [
  { id: "models", icon: "storefront", labelKey: "models", path: "/models", matches: (p) => p === "/models" },
  { id: "chat", icon: "forum", labelKey: "chat", path: "/c/new", matches: (p) => p === "/c" || p.startsWith("/c/") },
  { id: "launch", icon: "rocket_launch", labelKey: "launchNav", path: "/launch", matches: (p) => p === "/launch" },
  { id: "codex", icon: "terminal", labelKey: "codex", path: "/codex", matches: (p) => p === "/codex" },
  {
    id: "devtools",
    icon: "construction",
    labelKey: "devtools",
    path: "/devtools",
    matches: (p) => p === "/devtools",
  },
  {
    id: "toolbox",
    icon: "home_repair_service",
    labelKey: "toolbox",
    path: "/toolbox",
    matches: (p) => p === "/toolbox",
  },
  { id: "docs", icon: "menu_book", labelKey: "docs", path: "/docs", matches: (p) => p === "/docs" },
  { id: "status", icon: "monitor_heart", labelKey: "status", path: "/status", matches: (p) => p === "/status" },
  { id: "settings", icon: "settings", labelKey: "settings", path: "/settings", matches: (p) => p === "/settings" },
] as const

const DEFAULT_DESTINATION: Destination = DESTINATIONS[0]

/** Resolves which destination owns a given router pathname. Falls back to
 * the first destination (Models, the new home) for any URL none of them
 * claim — practically only the instant before the "/" redirect resolves. */
export function destinationForPath(pathname: string): Destination {
  return DESTINATIONS.find((destination) => destination.matches(pathname)) ?? DEFAULT_DESTINATION
}

export function destinationById(id: DestinationId): Destination {
  const found = DESTINATIONS.find((destination) => destination.id === id)
  if (!found) {
    throw new Error(`Unknown shell destination "${id}"`)
  }
  return found
}
