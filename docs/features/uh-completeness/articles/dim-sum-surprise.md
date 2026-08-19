# Dim Sum Surprise

## Behaviour

`app/ui/app/src/screens/status/dimSumSurprise.ts`'s `rollDimSumSurprise()` is a genuine, testable 10% roll: two independent `random()` calls (default `Math.random`, injectable for tests) -- one decides whether the surprise fires at all, the second picks which dish -- rather than one combined draw that a test would have to fight to observe both branches of. An empty catalog always returns `null` rather than fabricating a dish, honestly matching development builds, since `app/ui/buildinfo/buildinfo.default.json` never claims a catalog it never fetched. `dimSumSurprise.test.ts` proves an empty catalog always returns `null` regardless of the roll, a miss returns `null`, a hit returns a real catalog dish, and the dish returned is always one drawn from the supplied catalog, never fabricated.

`DimSumSurpriseCard.tsx`, rendered on the Status screen, is genuinely non-blocking and School-mode-gated: `DimSum.dom.test.tsx` proves it lists the real, embedded catalog dishes, shows an honest empty state for a development build with no catalog snapshot, renders a real dish when the roll hits and renders nothing at all (not a "no surprise" placeholder) when it misses, and -- critically -- is hidden entirely (not merely disabled) under School mode, both for the catalog listing and for a roll that would otherwise have hit, matching the hide-not-disable contract `school-mode.md` describes for every dim-sum-family capability.

As of this pass, the surprise is surfaced on the Status screen as a real card rather than the canonical contract's own "10% chance at startup, auto-dismissing, non-blocking toast" shape -- this is a real, tested roll and a real, School-gated rendering, but not yet the startup-timed transient surface the fuller contract describes.

## Configuration

TODO(dim-sum-surprise): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(dim-sum-surprise): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(dim-sum-surprise): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(dim-sum-surprise): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(dim-sum-surprise): link the related features, the prerequisites, and the natural next article a reader should open.
