/**
 * The namespace -> dictionary type map. Every `*.dict.ts` file augments this
 * interface with its own namespace via declaration merging, e.g.:
 *
 * ```ts
 * declare module "./registry" {
 *   interface DictRegistry {
 *     app: (typeof appDict)["dict"]
 *   }
 * }
 * ```
 *
 * `useT(namespace)` in `../t.ts` reads this map so a typo'd or cross-namespace
 * key is a compile error, not a runtime "key not found" console warning.
 *
 * This interface starts empty by design — it exists only to be merged into.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface DictRegistry {}
