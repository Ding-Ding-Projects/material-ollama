import type { DictRegistry } from "./registry"

/** A single dictionary entry: `[english, cantonese]`. */
export type DictEntry = readonly [en: string, yue: string]

/** A flat namespace of keyed bilingual entries. */
export type Dict = Record<string, DictEntry>

export interface DictHandle<D extends Dict> {
  readonly dict: D
}

const registry = new Map<string, Dict>()

/**
 * Register a namespaced dictionary. Returns a phantom-typed handle whose
 * `dict` property is the exact literal type of what was passed in — that is
 * what a co-located `declare module "./registry"` block captures via
 * `(typeof handle)["dict"]` to teach `useT()` the namespace's key union.
 *
 * Throws on a duplicate namespace registration: two dictionaries silently
 * fighting over one namespace is a bug, not a merge.
 */
export function defineDict<Ns extends string, const D extends Dict>(
  namespace: Ns,
  dict: D,
): DictHandle<D> {
  if (registry.has(namespace)) {
    throw new Error(`uh/dict: namespace "${namespace}" is already registered`)
  }
  registry.set(namespace, dict)
  return { dict }
}

/** Runtime lookup used by `useT()`. Namespace must already be registered. */
export function getDict(namespace: string): Dict | undefined {
  return registry.get(namespace)
}

export type { DictRegistry }
