# Changelog

All notable changes to this project are recorded here. Entries distinguish
local unreleased work from published releases and link to the exact commit
that supplied the evidence.

## [Unreleased]

The following local work is currently verified through
[`dc16db422293ba3a95b621da81aae7ae5786fc49`](https://github.com/Ding-Ding-Projects/material-ollama/commit/dc16db422293ba3a95b621da81aae7ae5786fc49)
but has not been published:

- Repaired public documentation wording so private conversational labels do
  not appear in README, handoff, migration fixtures, or status copy.
- Added a checked-in roadmap with real completion checkboxes and explicit
  release/publication pending states.
- Added this root changelog with commit-linked release history.
- Fixed the release publication failure that had blocked every build since
  2026-08-19. The publish job POSTed release asset uploads through `gh api`
  with a bare path, which resolves against `api.github.com`; asset uploads
  live on `uploads.github.com`, so every upload returned 404 and run
  32544293738 spent 64 minutes building an installer it could not hand over.
  The upload host now comes from the release response's own `upload_url`.
- Reduced the release to a single download. `OllamaSetup.exe` is the whole
  product -- desktop app, server and CLI for x64 and ARM64, the llama.cpp
  runners and every ggml CPU variant, and the WebView2 runtime it installs
  only when the machine lacks it. The versioned extras ZIP is gone; the
  portable archives, dependency audits, checksums, line-count table and
  `install.ps1` remain available as workflow run artifacts. The asset checker
  refuses a second asset, a duplicate, a flattened `__` path marker and a
  `--<hash>` suffix, so the old 57-asset release shape cannot return.
- Filtered the release trigger to `main`, so a push to a side branch no
  longer mints a release.
- Fixed `IsProcRunning` silently truncating the Windows process list. An
  earlier commit clamped the count to stop a panic, but truncation turns
  "is the installer running?" into a false negative on exactly the busy
  machines that caused the overflow. It now grows the buffer and retries.
- Added offline, hash-pinned x64 and arm64 WebView2 installer payloads to the
  normal installer path. The local installer is intentionally unsigned and
  passed PE provenance verification.
- Added the canonical GitHub Pages source, Page workflow, canonical metadata,
  and a byte-identical social-preview copy for the served site.

This entry intentionally does not claim a release. After publication, refresh
it with the exact integration commit, release tag, and remote evidence.

## [v0.0.0-build.18]

Published baseline at
[`3b33fc66c42c82b3d9fe0bfb012f85e68fc6ea6f`](https://github.com/Ding-Ding-Projects/material-ollama/commit/3b33fc66c42c82b3d9fe0bfb012f85e68fc6ea6f).
See [`docs/release.md`](./docs/release.md) for the release workflow and
evidence policy.
