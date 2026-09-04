# Changelog

All notable changes are recorded here with the exact commit or release that
supplied the evidence. Local work remains separate from published releases.

## [Unreleased]

The local handoff branch contains reconciliation commit
[`a963b3e8f9b1079faebc3f3a20cac94821ff43e7`](https://github.com/Ding-Ding-Projects/material-ollama/commit/a963b3e8f9b1079faebc3f3a20cac94821ff43e7), root-record commit
[`3dcea8c504940e81aeeeff2fc6e1adc4ce7e2dfe`](https://github.com/Ding-Ding-Projects/material-ollama/commit/3dcea8c504940e81aeeeff2fc6e1adc4ce7e2dfe), and Pages-source commit
[`91dafefec6bca9f6904a55ef424c175cb96f6662`](https://github.com/Ding-Ding-Projects/material-ollama/commit/91dafefec6bca9f6904a55ef424c175cb96f6662). It is not published and has not been merged to the default branch in this lane.

- Reconciled the documentation baseline around the published v47 release and
  separated it from the local candidate.
- Rewrote `HANDOFF.md` with the published release, workflow, Pages, installer,
  line-count, verification, inventory, capture, packaging, and updater facts.
- Rewrote `ROADMAP.md` with evidence-backed v47 checks and explicit open work
  for local integration, packaging, updater proof, inventory completion,
  capture refresh, parity gaps, Pages content, social preview settings, and
  onboarding surfaces.
- Updated `README.md` to link the v47 installer and to label the 12-capture
  matrix as historical evidence from `040f34d322906dcb1ef9dab25d45454a520797c9`.
- Updated the static Pages release card and hosting documentation to v47 while
  keeping deployment and served-byte verification open.

## [v0.0.0-build.47]

Published at
[`be7a750e41730cc756ab94f05551687a1402e006`](https://github.com/Ding-Ding-Projects/material-ollama/commit/be7a750e41730cc756ab94f05551687a1402e006).

- Release: [`v0.0.0-build.47`](https://github.com/Ding-Ding-Projects/material-ollama/releases/tag/v0.0.0-build.47).
- Release workflow run `33834466784` completed successfully.
- Pages workflow run `33834466774` completed successfully, and the public
  Pages URL returned anonymous HTTP 200.
- Published installer: `OllamaSetup.exe`, 472,699,515 bytes, SHA-256
  `2765d6703bfba4d32b673a10e5df530dc76dee75dcf9b6f193169cfc53f986d1`.
- Release notes had mutable control characters repaired and were read back
  clean.
- The installer is unsigned and still uses Inno Setup. Squirrel.Windows
  compliance remains open.
- The deployed Pages release card still advertises `v0.0.0-build.9` and
  requires a content correction.

## [v0.0.0-build.18]

Published at
[`3b33fc66c42c82b3d9fe0bfb012f85e68fc6ea6f`](https://github.com/Ding-Ding-Projects/material-ollama/commit/3b33fc66c42c82b3d9fe0bfb012f85e68fc6ea6f).
See [`docs/release.md`](./docs/release.md) for the release workflow and
evidence policy.
