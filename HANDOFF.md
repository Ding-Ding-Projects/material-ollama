# Handoff

Last updated: 2026-09-04. This handoff follows reconciliation commit
`a963b3e8f9b1079faebc3f3a20cac94821ff43e7`, root-record commit
`3dcea8c504940e81aeeeff2fc6e1adc4ce7e2dfe`, and Pages-source commit
`91dafefec6bca9f6904a55ef424c175cb96f6662`. The task branch contains all
three. It distinguishes that local candidate from the current published baseline,
`v0.0.0-build.47`, at `be7a750e41730cc756ab94f05551687a1402e006`.
The local candidate is not presented as a published release.

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

- The published installer is unsigned Inno Setup, not Squirrel.Windows. A
  Squirrel.Windows migration remains open.
- The updater still requires signature validation and has no verified
  ready-to-restart state. The updater contract remains open.
- The local Pages release card is corrected from `v0.0.0-build.9` to the
  current verified release. Deployment and served-byte verification remain open.
- The root `social-preview.png` still needs the manual repository setting
  action at Settings, General, Social preview. The file is committed, but the
  setting is not verified by a supported API.

## Local candidate and next actions

The task branch contains the local reconciliation, documentation refresh, and
static Pages release-card correction. Its default-branch integration and
push remain open in this handoff because this lane is not authorized to merge,
push, or change external GitHub records.

The next owner should complete these items in order:

1. Integrate and push the completed candidate to the default branch, then verify
   the exact remote commit and its workflow results.
2. Migrate the installer to Squirrel.Windows and remove the unsupported Inno
   Setup release path.
3. Complete the 51 in-progress desktop rows and the 85 missing landing-page
   rows with implementation, documentation, localization, focused checks,
   built-artifact interaction, and real capture evidence.
4. Refresh the current capture matrix and close the 18 design parity gaps with
   identical reference and built-artifact tuples.
5. Deploy the corrected Pages release card and verify the served bytes again.
6. Add verified updater ready-to-restart proof and remove the signature-
   validation requirement from the unsigned update path where the product
   contract requires it.
7. Complete the upstream onboarding surfaces.
8. Upload `social-preview.png` through the repository settings and record the
   result.

## Build references

The repository root `build.bat` remains the one-command Windows build path.
The supported local build and verification commands are documented in the
repository scripts and the feature inventory. Do not interpret a local build
or a historical capture as proof of v47 publication or of the local candidate.
