import { fact, type FactKind, type Localized } from "@/uh"
import type { TFunction } from "@/uh"

/**
 * Whether a fetched preference value is the compiled-in default or a
 * genuinely stored one. Equality-based: the server always returns a
 * complete document (see store.DefaultUIPreferences), so "the field
 * genuinely still holds the shipped default" and "the field is unset" are
 * indistinguishable from the client's side of the wire — this is the
 * honest signal that's actually available, and it's what every provenance
 * line on this screen is built from. A user who deliberately sets a field
 * back to its default value will see "compiled-in default" again, which is
 * factually true of the bytes on the wire even if not of their history.
 */
export function isDefaultValue<T>(current: T, defaultValue: T): boolean {
  return JSON.stringify(current) === JSON.stringify(defaultValue)
}

/**
 * Builds the one-line provenance readout every `SettingRow` carries:
 * "Currently: your saved value — <fact>" or "Currently: the compiled-in
 * default — <fact>", naming the real value either way rather than the bare
 * word "default". `t` must come from `useT("settingsUi")` (the two keys
 * this reads live in that dict namespace).
 */
export function provenanceFact<T extends string | number | boolean>(
  t: TFunction<"settingsUi">,
  current: T,
  defaultValue: T,
  kind: FactKind,
): Localized {
  const prefix = isDefaultValue(current, defaultValue)
    ? t("provenanceDefault")
    : t("provenanceStored")
  return fact(`${prefix} ${String(current)}`, kind)
}
