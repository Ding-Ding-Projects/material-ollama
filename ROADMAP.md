# Roadmap

This checklist describes the repository's current delivery boundaries. A
checked item means the corresponding local record or verification exists; it
does not claim that an unpublished build is released.

## Public records and release evidence

- [x] Keep README and handoff wording in ordinary public language.
- [x] Record current line-count and inventory evidence from committed scripts.
- [x] Keep the release/publication boundary explicit for unreleased local work.
- [ ] Integrate this local repair into the default branch.
- [x] Build the next unsigned Windows installer locally through
  `build-installer.bat /s` and verify its PE provenance.
- [ ] Publish the next unsigned Windows installer from the intended
  integration commit.
- [ ] Verify the published release target, assets, hashes, line-count table,
  timing, and unsigned status.

## Feature and evidence completion

- [ ] Complete the remaining desktop-app inventory rows with implementation,
  documentation, localized copy, focused checks, built-artifact interaction,
  and real capture evidence.
- [ ] Bring the landing/documentation surface to the same contract, or record
  a precise not-applicable boundary for each unsupported item.
- [ ] Attach the remaining focused checks, built-artifact interactions, and
  real captures to the inventory rows that are still in progress.
- [ ] Re-run the real built-app capture matrix once no user-owned installed
  application instance holds the product-wide single-instance lock.
- [ ] Upload the committed root `social-preview.png` through the repository's
  hosting settings; this remains an owner/manual external step while no
  supported API is available.
