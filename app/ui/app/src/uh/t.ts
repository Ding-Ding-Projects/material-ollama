import { useMemo } from "react"
import { useUh } from "./provider"
import type { Localized } from "./localized"
import { getDict } from "./dict"
import type { DictRegistry } from "./dict"

/** The `t()` function `useT()` returns, scoped to one dictionary namespace. */
export type TFunction<Ns extends keyof DictRegistry> = (
  key: Extract<keyof DictRegistry[Ns], string>,
) => Localized

/**
 * The dictionary-backed producer half of the "only `t()` and `fact()` mint
 * `Localized`" contract. `namespace` must be a registered dict namespace
 * (see `./dict`) — passing an unregistered or misspelled one, or a key that
 * does not belong to that namespace, is a compile error, not a runtime
 * fallback.
 *
 * Bilingual (`langMode === "both"`) returns `en + " · " + yue"`, matching
 * the design prototype exactly. School mode never needs a check here: by
 * the time `Voice.langMode` reaches this hook it has already been forced to
 * `"en"` at construction (see `./provider`).
 */
export function useT<Ns extends keyof DictRegistry & string>(namespace: Ns): TFunction<Ns> {
  const { langMode } = useUh()
  return useMemo(() => {
    const dict = getDict(namespace)
    const t = (key: string): Localized => {
      const entry = dict?.[key]
      if (!entry) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn(`uh/t: missing key "${key}" in dictionary namespace "${namespace}"`)
        }
        return key as Localized
      }
      const [en, yue] = entry
      if (langMode === "en") return en as Localized
      if (langMode === "yue") return yue as Localized
      return (en + " · " + yue) as Localized
    }
    return t as TFunction<Ns>
  }, [namespace, langMode])
}
