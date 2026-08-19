# Narration

## Behaviour

`app/ui/app/src/uh/narration.ts` (167 lines) is a real, carefully-built module: a module-level singleton `NarrationQueue` with a strict one-utterance-at-a-time FIFO, a documented Chromium workaround (`speechSynthesis.cancel()` immediately before every `speak()` call, to prevent a known bug where a stale queued utterance wedges the synthesizer), asynchronous voice enumeration that handles the browser returning an empty voice list synchronously and filling it in later behind `voiceschanged` (with a 2-second fallback timeout), explicit `en`/`zh-HK`-preferred voice selection that never silently falls back to English, and a `speakBoth()` method that serializes an English utterance strictly before its Cantonese counterpart, matching the "Both" narration mode the shared contract requires.

Despite that real implementation, a repository-wide search finds no call site anywhere that imports `narration` from `@/uh` or invokes `narration.speak`/`narration.setEnabled` -- no settings toggle, no app-event hook. `app/ui/app/src/uh/dict/narration.dict.ts`'s one `noCantoneseVoice` entry is defined but never rendered either. The module is real, off by default (matching the required default), and would work correctly the moment something calls it; today nothing does.

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
