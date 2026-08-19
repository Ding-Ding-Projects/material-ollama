# Blank Slate Presets

## Behaviour

`app/ui/app/src/components/locks/LockWizard.tsx` -- the anchored "Lock this element…" wizard `toy-locks.md` describes -- is this codebase's real implementation of the blank-slate presets contract: rather than opening to an empty method/duration form, it offers three named, derived starting points (`PRESETS`: "Quick password" -> password method, surface-only duration; "Session TOTP" -> TOTP method, until-app-closes duration; "Timed password" -> password method, 15-minute duration), each stating exactly what it sets before the user commits to it (`presetQuickPasswordDetail` etc.), and each fully editable and re-appliable afterward through the same form the presets populate -- applying a preset is a normal, undoable action rather than a special one-time operation, matching the contract's "the result is fully editable... applying a preset is a normal recorded action" requirement.

The wizard's own doc comment states its presets are "the blank-slate presets contract's derived starting points" -- i.e. each preset's method/duration combination is derived from the same real `LockMethod`/`LockDurationChoice` types `locksStore.ts` uses everywhere else, never an invented value dressed up as a default; a preset and the wizard's own manual controls can never disagree about what the underlying defaults mean, because they share one type.

No dedicated test file exists yet for `LockWizard.tsx` itself, so this is proven by reading the implementation rather than by a focused automated test in this pass.

## Configuration

TODO(blank-slate-presets): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(blank-slate-presets): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(blank-slate-presets): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(blank-slate-presets): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(blank-slate-presets): link the related features, the prerequisites, and the natural next article a reader should open.
