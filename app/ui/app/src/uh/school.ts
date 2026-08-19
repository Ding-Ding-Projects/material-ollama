import { useUh } from "./provider"

/**
 * The four feature families School mode makes behave as if they were never
 * installed: playful (Cantonese) language, humor/funny-level styling, the
 * dim sum surprise, and personal vocabulary.
 */
export type SchoolGatedFeature = "cantonese" | "humour" | "dimsum" | "vocab"

/**
 * Whether a School-mode-gated feature should render at all.
 *
 * The contract is HIDE, never disable: a consumer that gets `false` back
 * must return `null` (or otherwise omit the element from the tree) — never
 * render it with a `disabled` prop, `display: none`, `visibility: hidden`,
 * or `aria-hidden`. Any of those still leaves the control in the DOM for an
 * inspector, a screen reader in the wrong mode, or a DOM audit to find,
 * which defeats the point of a switch that is supposed to make these
 * features behave as if they were never installed.
 *
 * `feature` takes an explicit union rather than this always just returning
 * `!voice.schoolOn` unconditionally so every school-gated call site is
 * greppable (`rg "useShows\("`) and each family has a single point where
 * per-feature nuance could be added later without touching call sites.
 */
export function useShows(feature: SchoolGatedFeature): boolean {
  const voice = useUh()
  if (voice.schoolOn) return false
  switch (feature) {
    case "cantonese":
    case "humour":
    case "dimsum":
    case "vocab":
      return true
    default: {
      const exhaustive: never = feature
      return exhaustive
    }
  }
}
