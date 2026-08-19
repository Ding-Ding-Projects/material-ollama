# Dim Sum Release Catalog

## Behaviour

The Status screen's Dim Sum Catalog card (`app/ui/app/src/screens/status/DimSumCatalogCard.tsx`) renders `app/ui/release.go`'s `catalog` field -- a build-time snapshot of the public `Ding-Ding-Projects/dim-sum-photos` catalog, embedded so the release code-name lookup works fully offline rather than depending on a runtime fetch -- as a chip per dish, each carrying its bilingual name (`nameEn`/`nameZhHant`) exactly as the canonical contract requires ("Shrimp dumpling · 蝦餃"-style pairing). An honest empty state renders for a development build whose catalog snapshot is empty, and a real dish count is shown otherwise.

Like every other dim-sum-family surface, it is hidden entirely rather than merely disabled under School mode (`useShows("dimsum")` returning `false` short-circuits the whole card to `null`) -- the card's own doc comment states plainly that names, code names, and every dim-sum reference belong to that one family, not just the surprise toast covered in `dim-sum-surprise.md`.

The release code name itself (shown on `ReleaseCard.tsx` when a real, non-development release is running and School mode is off) is built as "English · 中文" from the resolved dish, matching the format this catalog card also uses. This card's own release-code-name pairing with `ReleaseCard.tsx` was not directly exercised by a dedicated test in this pass -- `DimSum.dom.test.tsx` covers the surprise roll card, not this catalog listing card, by name.

## Configuration

TODO(dim-sum-release-catalog): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(dim-sum-release-catalog): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(dim-sum-release-catalog): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(dim-sum-release-catalog): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(dim-sum-release-catalog): link the related features, the prerequisites, and the natural next article a reader should open.
