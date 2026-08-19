# School Mode

## Behaviour

`app/ui/app/src/uh/school.ts`'s `useShows(feature)` is the real hide-not-disable gate for the four School-mode-affected feature families (`"cantonese" | "humour" | "dimsum" | "vocab"`): when `voice.schoolOn` is true it returns `false` for all four, and every call site is required to treat that as "omit the element entirely," never a disabled/hidden-but-present one. `provider.tsx`'s `buildVoice()` folds School mode in at construction -- when `isSchoolOn(raw.school)` is true it returns the frozen `SCHOOL_VOICE` constant (English, funny level 0, emoji off, empty vocab) rather than the stored preferences, so a consumer downstream can never see "school is on, but I forgot to check."

The frontend has caught up with that backend: the Settings screen's School mode card (`app/ui/app/src/screens/Settings/SchoolModeCard.tsx`, 225 lines) genuinely calls all three real `app/ui/uh.go` endpoints -- `setSchoolPIN`/`clearSchoolPIN`/`unlockSchool` (`app/ui/app/src/screens/Settings/api.ts`) -- through real `useMutation` hooks. Turning School mode ON requires no PIN and patches `preferences.school.on` directly (matching the "self-imposed speed bump" contract: the PIN is what gets a user back OUT, not what lets them in); turning it OFF opens an inline unlock form that genuinely POSTs to `/api/v1/uh/school/unlock` and only patches `on: false` once the server reports `unlocked: true`, showing the shared "That PIN didn't match." copy on a wrong attempt. The card also renders a real rename field (`DebouncedTextField` bound to `preferences.school.name`) and PIN set/change/clear controls. The PIN itself is never read back from the server or displayed anywhere in this card -- `app/ui/uh.go` only ever returns `PinSet` (a boolean), matching the refusal on characterizing stored secrets.

`app/store/store.go`'s `SchoolPrefs{On, Name, PinSet}` remains the persisted shape (the PIN itself deliberately never touches this struct -- it lives in `SecretStore` instead), and the hide-not-disable gate this article's first paragraph describes (`useShows`, `SCHOOL_VOICE`) is exercised directly by `uh/localization.dom.test.tsx`'s "hides Cantonese, humour, dim sum and personal vocabulary while on, and shows all four while off" and "overrides a stored Cantonese/bilingual langMode back to English while school.on is true".

As with `language-modes.md`, the real `/settings` route currently crashes before a user can reach this card in the packaged build (see that article's caveat), so the frontend half above is proven at the component-test level only for now; the `useShows`/`SCHOOL_VOICE` gate itself is proven independently of the Settings screen and is unaffected by that crash.

## Configuration

TODO(school-mode): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(school-mode): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(school-mode): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(school-mode): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(school-mode): link the related features, the prerequisites, and the natural next article a reader should open.
