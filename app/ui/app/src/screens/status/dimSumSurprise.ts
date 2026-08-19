import type { ReleaseCatalogDish } from "./types"

/**
 * The dim-sum-surprise roll: a genuine 10% chance, evaluated once per
 * mount against whatever catalog this build actually embeds. Pulled out
 * as a pure function (rather than inlined in the component) so the roll
 * itself -- not just the rendering around it -- is directly testable with
 * an injected `random` source, instead of trusting a live 1-in-10 draw to
 * eventually land in a test run.
 *
 * Two independent `random()` calls: one decides whether the surprise
 * fires at all, the second picks which dish. An empty catalog (every
 * development build, since app/ui/buildinfo/buildinfo.default.json never
 * claims a catalog it never fetched) always returns `null` -- there is
 * nothing real to surprise anyone with.
 */
export function rollDimSumSurprise(
  catalog: readonly ReleaseCatalogDish[],
  random: () => number = Math.random,
): ReleaseCatalogDish | null {
  if (catalog.length === 0) return null
  if (random() >= 0.1) return null
  const index = Math.min(Math.floor(random() * catalog.length), catalog.length - 1)
  return catalog[index] ?? null
}
