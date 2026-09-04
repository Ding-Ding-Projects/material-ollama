# Roadmap

This checklist records evidence-backed delivery status. A checked item is
complete for the stated scope and commit. An unchecked item remains open.

## Published v47 evidence

- [x] Publish `v0.0.0-build.47` targeting
  `be7a750e41730cc756ab94f05551687a1402e006`.
- [x] Verify release workflow run `33834466784` completed successfully.
- [x] Verify Pages workflow run `33834466774` completed successfully.
- [x] Verify the public Pages URL returns anonymous HTTP 200.
- [x] Record `OllamaSetup.exe` at 472,699,515 bytes with SHA-256
  `2765d6703bfba4d32b673a10e5df530dc76dee75dcf9b6f193169cfc53f986d1`.
- [x] Read back the repaired release notes and confirm control characters are
  clean.
- [x] Record the v47 line-count table: 1,725 files, 516,655 total lines,
  452,333 non-blank lines, with 79,048 agent-attributed lines, 437,607
  other-attributed lines, and 0 unknown lines.
- [x] Record the v47 verification summary from `npm run verify`: 28
  deliberate inventory cases with 26 guard codes; 15 suite cases across 22
  areas, 14 covered and 8 partial; 30 design-parity mutations with 18 gaps
  and 0 verified parity rows; and 0 generic-control findings with 4
  documented exceptions.

## Local reconciliation candidate

- [ ] Integrate `task/finish-handoff-20260904`, including reconciliation
  `a963b3e8f9b1079faebc3f3a20cac94821ff43e7`, root records
  `3dcea8c504940e81aeeeff2fc6e1adc4ce7e2dfe`, and Pages source
  `91dafefec6bca9f6904a55ef424c175cb96f6662`, into the default branch.
- [ ] Push the integrated default branch and verify its remote commit and
  workflow results.
- [ ] Refresh this roadmap and the handoff after that integration is actually
  verified.

## Packaging and updater

- [ ] Migrate the unsigned installer from Inno Setup to Squirrel.Windows and
  verify the required installer set.
- [ ] Remove the current updater signature-validation requirement and prove
  the unsigned ready-to-restart state.

## Feature inventory and capture evidence

- [ ] Complete the 51 in-progress desktop inventory rows with implementation,
  documentation, localization, focused checks, built-artifact interaction,
  and real capture evidence.
- [ ] Complete the 85 missing landing-page rows, or document a precise
  not-applicable boundary for each unsupported item.
- [ ] Refresh current built-artifact captures. The checked-in 12-capture
  manifest at `040f34d322906dcb1ef9dab25d45454a520797c9` remains historical.
- [ ] Resolve the 18 design-parity inventory gaps with matching reference and
  built-artifact capture tuples and machine-readable diff evidence.
- [ ] Complete the upstream onboarding surfaces.

## Published Pages and repository settings

- [ ] Deploy the corrected Pages release card, which still advertises
  `v0.0.0-build.9` in production, then verify the served bytes.
- [ ] Upload the committed root `social-preview.png` through the repository
  settings and record the result. The setting remains a manual step because
  no supported API is available.
