# Windows release workflow

The repository publishes one Windows release for each push and for each manual `workflow_dispatch` run. The workflow is intentionally limited to the Windows application and its installable package.

## Build path

The workflow bootstraps the pinned toolchain described by [`scripts/release-dependencies.json`](../scripts/release-dependencies.json), then runs the supported build script:

```powershell
.\scripts\build_windows.ps1 cpu cpuArm64 ollama ollamaArm64 app appArm64 deps sign installer zip
```

`scripts/bootstrap_windows_tools.ps1` first reuses an exact-version machine installation when
one is available. If CMake 4.4.2, Ninja 1.13.2, LLVM-MinGW 20260616 UCRT x86_64, or Inno Setup
6.7.1 is absent, it downloads only the pinned official release asset, checks its SHA-256 digest,
and installs it below the user-scoped `%LOCALAPPDATA%\MaterialOllama\tools` directory. The
bootstrap writes a provenance marker beside each extracted tool; `build_windows.ps1` requires
that marker for newly bootstrapped tools and otherwise accepts only the explicitly named,
versioned legacy user-tool paths. No PATH entry or arbitrary download URL is trusted by itself.
Archive installs stage under a unique hidden sibling of that validated tool root and publish only
after the declared executable, version, and provenance marker pass; an incomplete cold-cache
attempt leaves no candidate directory that can block a retry. The root batch entrypoints invoke
the installed Windows PowerShell 5.1 path explicitly, so a child PATH cannot replace its hashing
and packaging cmdlets with an incompatible shell. Hashing helpers import the utility module from
their own `$PSHOME` manifest, and the unsigned probe imports the security module the same way, so
`-NoProfile` does not depend on implicit module discovery or a shadow module earlier in `PSModulePath`.

Large ZIP tool archives are path-validated through `System.IO.Compression` and extracted in-process;
the slow built-in archive cmdlet is not used for the cold-cache tool path.

`deps` also downloads two pinned Microsoft WebView2 Evergreen Standalone Installers (version
151.0.4129.101, x64 and ARM64) from the official `msedge.sf.dl.delivery.mp.microsoft.com` source. Each payload is
checked against its manifest SHA-256 before it is copied into `dist\webview2\` and embedded in
`OllamaSetup.exe`; installation probes the stable-channel HKCU/HKLM records and runs the matching
embedded installer with `/silent /install` only when the runtime is missing or too old. A fresh
machine never needs a network connection during product installation.

The copied `install.ps1` helper keeps unsigned delivery intact while verifying the downloaded
installer against the published release SHA-256. It first resolves the exact Material Ollama
release, downloads that release's own `browser_download_url`, and then checks the digest. It
accepts a documented `-ExpectedSha256` value as an optional cross-check; it never downloads an
upstream Ollama installer and never checks for an Authenticode signer.

The 7-Zip bootstrap treats the manifest version as a minimum. It parses the actual `7z.exe`
banner and reuses only an equal or newer installed version than the pinned `26.2.0` level after
verifying that `7z.exe` is usable on `PATH`. A missing, unparseable, or older package receives the pinned
installation request. If the install or either package probe cannot produce a usable package,
the workflow fails with the observed versions, exit codes, and command output rather than
silently continuing with an unverified archive tool.

The root bootstrap accepts Node.js `>=22.13.0`, matching the release workflow's pinned `22.13.0`
floor without downgrading a compatible installed release. Go is checked against the
repository's declared `1.26` line. Both checks refresh the current process PATH after installation.

The package is unsigned by project policy. The workflow fails if signing inputs are present and verifies that `OllamaSetup.exe` has Authenticode status `NotSigned`. Windows may show an unknown-publisher or SmartScreen warning.

## Release evidence

The build evidence is retained, but the public release has exactly two downloads: `OllamaSetup.exe`
and `material-ollama-extras-<tag>.zip`. Before the extras ZIP is built, [`scripts/check-release-assets.mjs`](../scripts/check-release-assets.mjs)
walks every `dist/windows-*` payload and proves that matching `ollama-<platform>*.zip` archives
cover every member, including zero-byte files and optional accelerator archives. The extras ZIP
contains the portable architecture/accelerator archives, desktop executables, dependency-audit
records, recursive `SHA256SUMS.txt`, line-count evidence, release metadata, the hash-verifying
`install.ps1` helper, and `extras-manifest.json`. The latter records each member's architecture,
backend, role, path, byte length, and SHA-256, excluding its own hash and the containing ZIP hash.
After publication, the workflow downloads and extracts the extras ZIP and runs
[`scripts/validate-extras-manifest.mjs`](../scripts/validate-extras-manifest.mjs), which rejects
missing, unexpected, duplicate, self-referential, length-mismatched, or hash-mismatched members.
The committed [`scripts/count-lines.mjs`](../scripts/count-lines.mjs) reports source, tests,
styles/markup, generated, and other categories with total and non-blank lines, plus surviving-line
attribution from `git blame`. Vendored trees, dependency directories, generated build output, and
lockfiles are excluded explicitly.

[`scripts/release-metadata.mjs`](../scripts/release-metadata.mjs) resolves one unused code name from the public dim-sum catalog and a published `catalog-v1` image URL. The release records that metadata without copying catalog images into this repository.

The published release notes expand the metadata into the code name, dish ID, English and Traditional Chinese names, source catalog release URL, and authoritative public image URL. They also state the no-copy boundary explicitly: the consumer project does not download, vendor, or attach a duplicate image asset.

Release tags use the source version plus the monotonic workflow run number, for example `v0.0.0-build.42`. The workflow refuses to reuse an existing tag, creates a numeric-ID draft release against the exact triggering commit, uploads through that ID, reads the draft's actual assets back, and only then changes that same ID to non-draft. A failed upload or validation leaves a recoverable draft and never strands a misleading public partial release. The workflow rejects any third or flattened/hash-suffixed asset name, uploads exactly the installer and versioned extras ZIP, and downloads both again to verify their published sizes and SHA-256 values.

GitHub Actions does not run tests, lint, or static-analysis jobs. Those checks remain available as local project scripts and are reported separately from release publication; an artifact publication is not presented as a test verdict.
