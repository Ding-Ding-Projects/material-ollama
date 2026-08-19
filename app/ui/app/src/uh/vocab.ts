import type { Localized } from "./localized"

/** One personal-vocabulary find/replace rule, applied at the text boundary. */
export interface VocabRule {
  readonly find: string
  readonly replace: string
}

/**
 * Pure find -> replace over already-localized text. Literal substring
 * matching only (no regex) — vocabulary rules are user data, not patterns,
 * and a `find` value containing regex metacharacters must still match
 * itself literally. Rules apply in order; a later rule can act on an
 * earlier rule's replacement text, which is the simplest predictable
 * behavior for a short user-authored list.
 */
export function applyVocab(text: Localized, rules: readonly VocabRule[]): Localized {
  if (rules.length === 0) return text
  let out: string = text
  for (const rule of rules) {
    if (rule.find.length === 0) continue
    out = out.split(rule.find).join(rule.replace)
  }
  return out as Localized
}
