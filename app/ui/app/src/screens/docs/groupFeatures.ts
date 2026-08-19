import type { DocsFeature } from "@/api"

export interface DocsGroup {
  letter: string
  features: DocsFeature[]
}

/**
 * Filters by plain-text substring (case-insensitive, matched against title
 * and id) by default; in regex mode, matches a case-insensitive `RegExp`
 * against the same two fields. An invalid pattern is treated as "zero
 * matches" rather than thrown -- the same contract the command palette's
 * own regex-mode filtering uses (see
 * app/ui/app/src/components/shell/CommandPalette.tsx).
 */
export function filterFeatures(
  features: DocsFeature[],
  query: string,
  regexMode: boolean,
): DocsFeature[] {
  const trimmed = query.trim()
  if (!trimmed) return features

  if (regexMode) {
    let pattern: RegExp
    try {
      pattern = new RegExp(trimmed, "i")
    } catch {
      return []
    }
    return features.filter((feature) => pattern.test(feature.title) || pattern.test(feature.id))
  }

  const needle = trimmed.toLowerCase()
  return features.filter(
    (feature) => feature.title.toLowerCase().includes(needle) || feature.id.toLowerCase().includes(needle),
  )
}

/**
 * Buckets an already-filtered feature list into A-Z groups by the first
 * letter of each feature's title, each bucket internally sorted by title.
 * Every feature in the shared inventory has a non-empty `title`, so every
 * feature lands in exactly one bucket -- there is no "misc" catch-all group
 * that could silently drift out of sync with the inventory, unlike a
 * hand-maintained topic taxonomy would.
 */
export function groupFeaturesAlphabetically(features: DocsFeature[]): DocsGroup[] {
  const sorted = [...features].sort((a, b) => a.title.localeCompare(b.title))
  const groups: DocsGroup[] = []

  for (const feature of sorted) {
    const letter = feature.title.charAt(0).toUpperCase() || "#"
    const last = groups[groups.length - 1]
    if (last && last.letter === letter) {
      last.features.push(feature)
    } else {
      groups.push({ letter, features: [feature] })
    }
  }

  return groups
}
