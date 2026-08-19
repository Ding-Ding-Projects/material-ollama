/**
 * The branded string type that every user-facing text sink must require.
 *
 * A plain `string` cannot be assigned where `Localized` is expected — only
 * `t()` (see `./t`) and `fact()` (below) can mint one. That makes
 * `<div>{"Hello"}</div>` a compile error the moment the surrounding prop or
 * sink is typed `Localized`, instead of a lint warning someone has to notice.
 *
 * `src/uh/Txt.tsx` is the one place raw JSX children are allowed to become
 * `Localized` (its `content` channel, for user-authored text such as a typed
 * chat message) — that boundary is deliberate and documented there.
 */
declare const brand: unique symbol
export type Localized = string & { readonly [brand]: "localized" }

/**
 * What kind of fact a `fact()` call is carrying. This is documentation and a
 * grep anchor today (`rg "fact\(" src/`), and a hook for kind-specific
 * formatting later — it never changes whether the call is allowed.
 */
export type FactKind =
  | "model-name"
  | "tag"
  | "digest"
  | "path"
  | "command"
  | "bytes"
  | "count"
  | "timestamp"
  | "user-input"

/**
 * The deliberate escape hatch for values that are not translated prose —
 * model names, file paths, digests, byte counts, raw user input. `fact()`
 * never runs a value through the dictionary, `funny()`, or `applyVocab()`;
 * it only brands the value so it can reach a `Localized` sink.
 *
 * `kind` is currently informational only (it is what makes
 * `rg "fact\(" src/` a meaningful audit trail of every escape-hatch use);
 * `void kind` below keeps it a real, checked parameter rather than a
 * write-once convention nobody enforces.
 */
export function fact(value: string | number, kind: FactKind): Localized {
  void kind
  return String(value) as Localized
}
