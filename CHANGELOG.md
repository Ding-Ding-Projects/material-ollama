# Changelog

All notable changes are recorded here with the exact commit or release that
supplied the evidence. Local work remains separate from published releases.

## [Unreleased]

The unreleased source reference is
[`89d5b3e307c539466a22677d92b84ac10e50ca48`](https://github.com/Ding-Ding-Projects/material-ollama/commit/89d5b3e307c539466a22677d92b84ac10e50ca48),
integrating [`5dbbf0c8a5572ac7a9ad11cd6d29435a7c749ba8`](https://github.com/Ding-Ding-Projects/material-ollama/commit/5dbbf0c8a5572ac7a9ad11cd6d29435a7c749ba8)
with monotonic package versioning at
[`9dab660cf2f09fc952886ccb2d69a54476942d98`](https://github.com/Ding-Ding-Projects/material-ollama/commit/9dab660cf2f09fc952886ccb2d69a54476942d98).
It includes the workflow repair at
[`49d4cf53`](https://github.com/Ding-Ding-Projects/material-ollama/commit/49d4cf53),
native Squirrel packaging at
[`17ee94ba`](https://github.com/Ding-Ding-Projects/material-ollama/commit/17ee94ba),
root build activation at
[`361341e8`](https://github.com/Ding-Ding-Projects/material-ollama/commit/361341e8),
lifecycle support at
[`0286388c`](https://github.com/Ding-Ding-Projects/material-ollama/commit/0286388c),
and the production-only fast release bundle command at
[`104e091e`](https://github.com/Ding-Ding-Projects/material-ollama/commit/104e091e).
This source is not a published release and has no candidate installer or release
asset hash yet.

- Documented the fast native release-candidate route and its explicit boundary:
  no post-switch tests, lint, reviews, audits, or captures were run.
- Recorded that `v0.0.0-build.47` remains the published Inno Setup baseline and
  that no native Squirrel installer has yet been built or published.
- Added the root build command and fast release commands to the project build
  documentation, with the native Go payload boundary made explicit.
- Recorded the public delivery boundary: v47 remains the only verified public
  release, while the corrected site source, candidate downloads, and social
  metadata all await actual deployment or release readback.

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
