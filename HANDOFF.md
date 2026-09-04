# Handoff

Last updated: 2026-09-04. This handoff distinguishes the current published
baseline, `v0.0.0-build.47` at `be7a750e41730cc756ab94f05551687a1402e006`,
from the unreleased native-package source. The current combined source reference
is `89d5b3e307c539466a22677d92b84ac10e50ca48`, which integrates
`5dbbf0c8a5572ac7a9ad11cd6d29435a7c749ba8` with monotonic reachable-commit
package versioning from `9dab660cf2f09fc952886ccb2d69a54476942d98`. It
includes the clean workflow repair (`49d4cf53`), unsigned Squirrel package
path (`17ee94ba`), root build activation (`361341e8`), lifecycle support
(`0286388c`), updater work (`104e091e` and its integrated follow-ups), and the
combined workflow and native-update integration. No installer built from this
source has been published, and no future tag, asset size, or hash is claimed here.

| Source component | Permanent source link |
| --- | --- |
| Workflow repair | [`49d4cf53c3d3ae867311bdde0a26c95ffeab192a`](https://github.com/Ding-Ding-Projects/material-ollama/commit/49d4cf53c3d3ae867311bdde0a26c95ffeab192a) |
| Native Squirrel package path | [`17ee94baf0b3f9b42673349d9c03f62da25a127b`](https://github.com/Ding-Ding-Projects/material-ollama/commit/17ee94baf0b3f9b42673349d9c03f62da25a127b) |
| Root build activation | [`361341e830d2dc3d329c15a65326be7b0b811305`](https://github.com/Ding-Ding-Projects/material-ollama/commit/361341e830d2dc3d329c15a65326be7b0b811305) |
| Lifecycle support | [`0286388cbbd246bb3a8816c2d9d5ff8d218a43a9`](https://github.com/Ding-Ding-Projects/material-ollama/commit/0286388cbbd246bb3a8816c2d9d5ff8d218a43a9) |
| Fast release bundle command | [`104e091e475bd6178c7462cd53ed6db2f1ad9ec5`](https://github.com/Ding-Ding-Projects/material-ollama/commit/104e091e475bd6178c7462cd53ed6db2f1ad9ec5) |
| Monotonic package versions | [`9dab660cf2f09fc952886ccb2d69a54476942d98`](https://github.com/Ding-Ding-Projects/material-ollama/commit/9dab660cf2f09fc952886ccb2d69a54476942d98) |
| Combined source integration | [`5dbbf0c8a5572ac7a9ad11cd6d29435a7c749ba8`](https://github.com/Ding-Ding-Projects/material-ollama/commit/5dbbf0c8a5572ac7a9ad11cd6d29435a7c749ba8) |
| Combined candidate reference | [`89d5b3e307c539466a22677d92b84ac10e50ca48`](https://github.com/Ding-Ding-Projects/material-ollama/commit/89d5b3e307c539466a22677d92b84ac10e50ca48) |
| Host PowerShell module repair | [`7c8589b8f2126b7da05fdfdfd0366d4119af6a8b`](https://github.com/Ding-Ding-Projects/material-ollama/commit/7c8589b8f2126b7da05fdfdfd0366d4119af6a8b) |

## Published baseline

- Release: [`v0.0.0-build.47`](https://github.com/Ding-Ding-Projects/material-ollama/releases/tag/v0.0.0-build.47), targeting `be7a750e41730cc756ab94f05551687a1402e006`.
- Release workflow run: [`33834466784`](https://github.com/Ding-Ding-Projects/material-ollama/actions/runs/33834466784), success.
- Pages workflow run: [`33834466774`](https://github.com/Ding-Ding-Projects/material-ollama/actions/runs/33834466774), success.
- Public Pages URL: <https://ding-ding-projects.github.io/material-ollama/>, verified with an anonymous HTTP 200 response.
- Installer: [`OllamaSetup.exe`](https://github.com/Ding-Ding-Projects/material-ollama/releases/download/v0.0.0-build.47/OllamaSetup.exe), 472,699,515 bytes, SHA-256 `2765d6703bfba4d32b673a10e5df530dc76dee75dcf9b6f193169cfc53f986d1`.
- The installer is unsigned. The current release still uses Inno Setup and is not compliant with the required Squirrel.Windows packaging route.
- Release notes had mutable control characters repaired and were read back clean after the repair.
- The deployed Pages content is reachable, but its release card still advertises `v0.0.0-build.9`. The local candidate corrects the source to v47; deployment and served-byte verification remain open.

## Measured v47 verification

The committed line counter at `be7a750e41730cc756ab94f05551687a1402e006`
reported the following surviving-line inventory:

| area | files | total lines | non-blank lines |
| --- | ---: | ---: | ---: |
| source | 918 | 307,321 | 266,485 |
| tests | 487 | 184,476 | 166,520 |
| styles and markup | 320 | 24,858 | 19,328 |
| total | 1,725 | 516,655 | 452,333 |

Surviving-line attribution was 79,048 agent-attributed lines, 437,607
other-attributed lines, and 0 unknown lines. The counter excludes vendored
sources, third-party trees, dependency directories, generated build output,
and lockfiles according to its committed rules.

`npm run verify` passed at the v47 baseline with these measured results:

- Completeness inventory: 28 deliberate cases and 26 guard codes.
- Suite inventory: 15 deliberate cases across 22 areas, with 14 covered and 8 partial.
- Design parity self-test: 30 mutations, 18 gaps, and 0 verified parity rows.
- Generic controls: 0 findings with 4 documented exceptions.

The feature inventory is 22 of 170 rows verified. The desktop surface has 22
verified rows, 51 in progress, and 12 not applicable. The landing page has 85
missing rows. These counts are evidence boundaries, not completion claims.

## Capture and parity evidence

The checked-in capture manifest is historical at
`040f34d322906dcb1ef9dab25d45454a520797c9`. It contains 12 captures and a
network audit of 182 loopback-only requests. Those captures are genuine and
hash-valid for that older build, but they are not v47 captures and do not prove
the local candidate.

Current design capture files are also genuine and hash-valid. The design parity
inventory still records 18 gaps, so the files do not close the parity check.
The current capture matrix must be refreshed against the candidate or the next
verified release before it can be used as current product evidence.

## Packaging and update boundaries

- The published v47 installer is unsigned Inno Setup. It remains historical
  evidence only and is not evidence for the current native Squirrel source.
- The unreleased source contains the unsigned native Squirrel.Windows package
  route, lifecycle handling, and updater changes. It has no built candidate
  installer, package receipt, published release, or release asset verification
  yet.
- The updater source is not a verified ready-to-restart result. The existing
  earlier updater and UI build evidence predates the ultra-speed delivery
  boundary and the user-interface bundle has since changed.
- The first native PowerShell bootstrap attempt exposed a host-module hashing
  problem. The host-module repair is ready, but its retry and the candidate
  package build are pending. No build outcome is inferred from source changes.
- The local Pages release card is corrected from `v0.0.0-build.9` to the
  current verified release. Deployment and served-byte verification remain open.
- The root `social-preview.png` still needs the manual repository setting
  action at Settings, General, Social preview. The file is committed, but the
  setting is not verified by a supported API.

## Public delivery boundary

- The public GitHub release, immutable download link, and installer hash remain
  the verified v47 baseline. They must not be relabelled as candidate evidence.
- The public site source contains the corrected v47 release-card content, but
  the served site still advertises `v0.0.0-build.9` until deployment and
  anonymous served-byte verification complete.
- No candidate installer download, served download control, release asset, or
  social metadata is verified for the current source. The root social-preview
  file is committed, while the repository social-preview setting is still a
  manual pending action.

## Release candidate and next actions

The current task source is an unreleased release candidate. Issue
[#1](https://github.com/Ding-Ding-Projects/material-ollama/issues/1) remains
open and must not be closed by a source-only handoff. The preserved contaminated
branch `task/actions-build-only-20260904` remains at `82354155`; its historical
residue is retained because removing it would require prohibited history
rewriting. The recovered clean source deliberately excludes that residue.

The next owner should complete these items in order:

1. Integrate the completed source into the default branch, then use the final
   integrated commit as the only build candidate.
2. Set `MATERIAL_OLLAMA_BUILD_MODE=release-fast`, run
   `build.bat /s --release-fast`, then run `build-installer.bat /s` against
   that unchanged candidate. These commands build native Go payloads and
   Squirrel packages, not an Electron `app.asar` payload.
3. Publish only if the resulting candidate has the required release assets and
   a new unique tag. Record the actual tag, commit, asset names, sizes, and
   hashes only after publication and readback.
4. Deploy the corrected public site source, verify served bytes anonymously,
   then expose only the actual immutable release download and matching social
   metadata.
5. Complete the 51 in-progress desktop rows and the 85 missing landing-page
   rows with implementation, documentation, localization, focused checks,
   built-artifact interaction, and real capture evidence.
6. Refresh the current capture matrix and close the 18 design parity gaps with
   identical reference and built-artifact tuples.
7. Add verified updater ready-to-restart proof for the unsigned package path.
8. Complete the upstream onboarding surfaces.
9. Upload `social-preview.png` through the repository settings and record the
   result.

## Build references

The repository root `build.bat` remains the one-command Windows build path.
The build documentation index is [docs/features/build/README.md](docs/features/build/README.md).
The fast release commands intentionally skip tests, lint, reviews, and capture
work under the current ultra-speed delivery boundary. Do not interpret a local
build or a historical capture as publication, installation, runtime, or visual
verification of the candidate.
