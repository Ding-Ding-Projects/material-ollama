# Narration

## Behaviour

`app/ui/app/src/uh/narration.ts` (167 lines) is a real, carefully-built module: a module-level singleton `NarrationQueue` with a strict one-utterance-at-a-time FIFO, a documented Chromium workaround (`speechSynthesis.cancel()` immediately before every `speak()` call, to prevent a known bug where a stale queued utterance wedges the synthesizer), asynchronous voice enumeration that handles the browser returning an empty voice list synchronously and filling it in later behind `voiceschanged` (with a 2-second fallback timeout), explicit `en`/`zh-HK`-preferred voice selection that never silently falls back to English, and a `speakBoth()` method that serializes an English utterance strictly before its Cantonese counterpart, matching the "Both" narration mode the shared contract requires.

A real settings toggle now exists: `LanguageVoiceCard.tsx`'s "Narrator" section renders an on/off `Switch` bound to `preferences.narration.on`, a language `Select` (English/Cantonese/Both) bound to `preferences.narration.lang`, and a rate `Slider` (0.5x-2x) bound to `preferences.narration.rate` -- all three PATCH the real `/api/v1/uh/preferences` endpoint through `patchPreferences({ narration: { ...preferences.narration, ... } })`. `app/ui/app/src/uh/dict/narration.dict.ts`'s own `noCantoneseVoice` entry is still never rendered anywhere -- that specific dict file remains dead -- but the card's real narrator strings live in `settingsUi.dict.ts` instead (`narratorOnLabel`, `narratorLangLabel`, etc.), so the on/off/language/rate half of the contract is genuinely reachable today even though this one specific dictionary file is not the one serving it.

What still does not exist: no call site anywhere imports the `app/ui/app/src/uh/narration.ts` module described above or invokes its `NarrationQueue.speak()`/`speakBoth()` -- the Settings card writes the *preference* for whether narration is on, but nothing in the app actually triggers a narrated utterance for an app event yet. The module remains real, well-built, and off by default; it is reachable by preference now, but still not wired to anything that would call it.

As with `language-modes.md`, the real `/settings` route currently crashes before a user can reach this card in the packaged build (see that article's caveat), so the preference-writing half above is proven at the component-test level only for now.

## Configuration

TODO(narration): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(narration): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(narration): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(narration): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(narration): link the related features, the prerequisites, and the natural next article a reader should open.
