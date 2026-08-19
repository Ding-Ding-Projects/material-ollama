# Language Modes

## Behaviour

`app/ui/app/src/uh/provider.tsx`'s `UhProvider`/`useUh()` and `t.ts`'s `useT()` are the real consumption engine behind every piece of dictionary-backed copy in the app: `buildVoice()` reads a `langMode` of `"en"`/`"yue"`/`"both"` from a stored-preferences object, and `useT`'s bilingual branch returns `en + " · " + yue` for `"both"` exactly as the shared contract specifies. Every `<Txt ns="..." k="..." />` call site across the app (dozens of them, per the `k="..."` greps used elsewhere in this inventory pass) already flows through this same pipeline, so a change to `langMode` would immediately re-render every one of those strings correctly.

What does not exist yet is the writer half: `provider.tsx`'s own comment states plainly that it currently only *reads* whatever lands under the `material-ollama:preferences` localStorage key, and a repository-wide search for `localStorage.setItem` against that key finds nothing -- no settings screen, toggle, or control anywhere in the codebase ever writes a `langMode` value. The backend half is further along: `app/ui/uh.go`'s `uhGetPreferences`/`uhPatchPreferences` (with a `legalLangModes` allowlist) is a real, working API surface backed by `app/store/store.go`'s `UIPreferences.LangMode` column -- but the frontend does not call it. So today a user has no way to actually change the app's language mode; the machinery that would honor the choice the moment it exists is built and correct, but inert.

## Configuration

TODO(language-modes): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(language-modes): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(language-modes): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(language-modes): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(language-modes): link the related features, the prerequisites, and the natural next article a reader should open.
