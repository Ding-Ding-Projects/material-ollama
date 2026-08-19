# Narrator Voice Selection

## Behaviour

The Settings screen's Language & Voice card (`app/ui/app/src/screens/Settings/LanguageVoiceCard.tsx`) offers two independent voice pickers, one per narrated language, sourced from the platform's real `speechSynthesis.getVoices()` list via `narratorVoices.ts`'s `useSpeechVoices()` -- which correctly handles the platform quirk where that list returns empty synchronously on the first call and fills in asynchronously behind a `voiceschanged` event: the hook subscribes and re-reads rather than trusting one snapshot, so a picker never reports "no voices installed" on a machine that genuinely has forty. Each picker's `Select` includes an explicit **Choose automatically** entry (`AUTO_VOICE`, the empty string, guaranteed never to collide with a real `voiceURI`) as the shipped default, plus every voice the platform actually reports for that language, resolved by the real installed voice list rather than a hard-coded name.

The stored voice identity is the platform's own stable `voiceURI`, never its display name -- `decodeVoicePrefs`/`encodeVoicePrefs` persist `{en, yue}` as one JSON-encoded string inside `NarrationPrefs.Voice` (`app/store/store.go`), because that Go field is a single string and extending the struct with a second field was outside this lane's allowed paths; the encoding is a deliberate bridge, not a design regression. `isVoiceInstalled()` compares the stored URI against the live voice list so a picker can say plainly when a previously-chosen voice is not installed on this machine (`narratorNotInstalled`) while keeping the choice rather than silently resetting it. A dedicated "Preview" button per language calls `previewVoice()`, which speaks a real, language-appropriate sample phrase directly through `speechSynthesis.speak()` using the exact selected voice -- deliberately bypassing the app-wide `NarrationQueue` (which always auto-picks by language and has no per-voice override), so a preview genuinely demonstrates the voice that will be used rather than merely persisting a preference nothing yet consults. A rate slider (0.5x-2x) is shared across both languages via `preferences.narration.rate`.

As with `language-modes.md`, the real `/settings` route currently crashes before a user can reach this card in the packaged build.

## Test coverage

`narratorVoices.test.ts` now covers the encode/decode bridge directly: a `{en, yue}` pair round-trips through `encodeVoicePrefs`/`decodeVoicePrefs` exactly; an empty stored string (never set) decodes to "automatic for both"; malformed JSON decodes to the same safe default rather than throwing; a partial or wrongly-typed field (a stored `en` with no `yue`, or a `yue` that is not a string) defaults only the affected language rather than discarding the other language's real, already-stored choice; and a JSON value that parses but is not a plain object (a bare array or number) also fails closed to the same default. `isVoiceInstalled()`'s live-list comparison and the card's own `Select`/Preview-button rendering remain uncovered by a dedicated test in this pass.

## Configuration

TODO(narrator-voice-selection): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(narrator-voice-selection): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(narrator-voice-selection): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

- Focused test: `app/ui/app/src/screens/Settings/narratorVoices.test.ts::round-trips two distinct per-language voice URIs exactly` (plus its four sibling cases in the same file).
- Built-artifact proof: not yet attached -- the voice pickers sit below the fold on `/settings`, and no capture in this inventory's manifest shows them.
- Capture evidence: not yet attached, for the same reason. Recapturing `/settings` scrolled to the narrator voice rows would close this gap honestly.

## Suggested articles

TODO(narrator-voice-selection): link the related features, the prerequisites, and the natural next article a reader should open.
