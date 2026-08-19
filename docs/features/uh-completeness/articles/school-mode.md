# School Mode

## Behaviour

`app/ui/app/src/uh/school.ts`'s `useShows(feature)` is the real hide-not-disable gate for the four School-mode-affected feature families (`"cantonese" | "humour" | "dimsum" | "vocab"`): when `voice.schoolOn` is true it returns `false` for all four, and every call site is required to treat that as "omit the element entirely," never a disabled/hidden-but-present one. `provider.tsx`'s `buildVoice()` folds School mode in at construction -- when `isSchoolOn(raw.school)` is true it returns the frozen `SCHOOL_VOICE` constant (English, funny level 0, emoji off, empty vocab) rather than the stored preferences, so a consumer downstream can never see "school is on, but I forgot to check."

The backend is considerably further along than the frontend here: `app/ui/uh.go` implements real `uhSetSchoolPIN`/`uhClearSchoolPIN`/`uhUnlockSchool` endpoints (L182-L302), including a rate limiter (`unlockLimiter`) that returns HTTP 429 with a `Retry-After` header after too many failed attempts, and `app/store/store.go`'s `SchoolPrefs{On, Name, PinSet}` (the PIN itself deliberately never touches this struct -- it lives in `SecretStore` instead). No frontend UI has been found that calls any of those three endpoints, sets a PIN, or renders a rename control, so `useShows` today always evaluates against the default (School mode off) `Voice` the same unwritten localStorage key everywhere else in this cluster produces.

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
