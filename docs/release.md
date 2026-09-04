# Windows release workflow

The project publishes a Windows release for each push and each manual
`workflow_dispatch` run. The active delivery path builds the native Go desktop
payload and packages each supported architecture with genuine unsigned
Squirrel.Windows.

## Build path

The supported local commands are:

```powershell
.\build.bat /s
.\build-installer.bat /s
```

The root `build-installer.bat` builds the required CPU, CLI, desktop and offline
runtime payloads for both architectures in one invocation, then runs
`scripts/verify-squirrel-build.ps1`. It never publishes a release.

`scripts/bootstrap_windows_tools.ps1` reuses a verified compatible machine
tool where allowed, then installs missing tools into the user-scoped
`%LOCALAPPDATA%\MaterialOllama\tools-v2` location. CMake 4.4.2, Ninja 1.13.2,
LLVM-MinGW 20260616 UCRT x86_64, and Squirrel.Windows 2.0.1 are pinned in
[`scripts/release-dependencies.json`](../scripts/release-dependencies.json).
The Squirrel.Windows package is fetched from the NuGet flat-container URL and
its SHA-256 is checked before extraction. No PATH-only or arbitrary download
is trusted. Every extracted tool carries a version-1 provenance marker.

`deps` downloads the two pinned Microsoft WebView2 Evergreen Standalone
Installers and verifies each SHA-256 before it enters the architecture payload.
The matching Squirrel package carries the offline installer under
`lib/net45/webview2/`.

The permanent no-signing policy is active. Signing inputs are cleared before
releasify and no `--signWithParams` argument is supplied. The generated setup
executable is required to report Authenticode `NotSigned`; an unknown-publisher
or SmartScreen warning on install is expected.

## Squirrel.Windows packaging

[`scripts/package-squirrel.ps1`](../scripts/package-squirrel.ps1) creates one
NuGet package for each architecture with stable package IDs `MaterialOllamaX64`
and `MaterialOllamaArm64`. The
existing installed identities remain stable: `ollama app.exe` is the desktop
entry point and `ollama.exe` is the server and CLI. The output directories are:

```text
dist/squirrel-windows/x64/
dist/squirrel-windows/arm64/
```

Each directory contains `Setup.exe`, `RELEASES`, a full
`MaterialOllamaX64-<version>-full.nupkg` or
`MaterialOllamaArm64-<version>-full.nupkg`, and a delta package only when a valid
prior full package and matching `RELEASES` row are available. The first package
has no delta. Candidates are built in a unique sibling directory. Existing output
is moved to a uniquely named backup only after the candidate passes verification;
promotion failure restores that backup. Previous output and failed candidates remain
recoverable. Output roots are restricted to the architecture's directory beneath
`dist/squirrel-windows`, and reparse paths are rejected.

`scripts/squirrel-contract.ps1` owns the numeric package version. The default is
`1.<total reachable commit count>.<sequence>`. Reachable history grows for every
descendant integration, including merges that change the first-parent chain.
A local build uses sequence zero;
Actions uses `run_number * 10 + run_attempt`, allowing attempts 1 through 9.
Every numeric component must be at most 65534. `PACKAGE_VERSION` can pin an
explicit numeric version for a coordinated manual build; both root scripts must
inherit that same value. A validated prior package must have a strictly lower
version. This starts a new Squirrel lineage and does not compare old upstream
prerelease labels as package versions.
The default build does not parse `git describe` or require `VERSION`. The legacy
`VERSION` variable does not override the numeric package identity; use the
validated `PACKAGE_VERSION` override when pinning a candidate explicitly.

The build records the unchanged source commit, source/index trees, dependency
manifest hashes and payload SHA-256 values in `dist/payload-receipt.json`.
Packaging refuses stale or unreceipted payload bytes. Generated build metadata
lives under ignored `dist/` and is embedded using Go's compiler overlay, keeping
the committed source unchanged. Each installed version carries
`package-version.json` beside `ollama app.exe`. Squirrel installs beneath
`%LOCALAPPDATA%/MaterialOllamaX64` or `%LOCALAPPDATA%/MaterialOllamaArm64`;
the application's existing user data remains in `%LOCALAPPDATA%/Ollama`.

The deterministic verifier,
[`scripts/verify-squirrel-artifacts.ps1`](../scripts/verify-squirrel-artifacts.ps1),
checks the version-1 provenance record, actual setup PE structure and unsigned status,
every `RELEASES` row's package name, byte length and SHA-1, path traversal,
unindexed packages, the full package manifest, architecture, source commit,
and every packaged executable/DLL's actual architecture, plus required desktop,
CLI, inference-server, icon, offline WebView2 and installed-version entries.
It writes a machine-readable
receipt beside the package set. A failed check is fatal and never becomes a
release claim.

## Release evidence

The public release carries two architecture-specific setup assets:
`MaterialOllama-x64-Setup.exe` and `MaterialOllama-arm64-Setup.exe`. The release
asset checker rejects missing architecture assets, unexpected names, duplicate
names, flattened path markers, and hash-suffixed names. The public release also
carries `MaterialOllama-x64-RELEASES`, `MaterialOllama-arm64-RELEASES`, both
current full packages, any current delta packages, and one
`material-ollama-update.json`. Package filenames retain Squirrel's native names.
The updater stages each architecture's index as literal `RELEASES` locally.

The update manifest is limited to 64 KiB. Its schema is
`{schemaVersion:1, version, sourceCommit, architectures:{x64,arm64}}`. Each
architecture contains `packageId`, `setup:{name,sha256,size}`,
`releases:{name,sha256,size}`, and `packages:[{name,sha256,sha1,size,kind}]`,
where kind is `full` or `delta`. Index rows use exactly
`SHA1 filename byteCount`. Every manifest member is checked against staged bytes;
package hashing streams data rather than loading whole packages into memory.
The shared verifier writes a unique release directory and its relative name into
`dist/squirrel-windows/release-assets-path.txt` for the publisher.

The supporting run artifact also carries architecture payloads, provenance and
receipt JSON, dependency-audit records, `SHA256SUMS.txt`, line-count evidence,
and release metadata. `scripts/count-lines.mjs` remains the source of the
release line-count table, with dependencies, generated build output and other
excluded trees named explicitly.

Release tags use the numeric package version, such as `v1.100.421`.
The workflow refuses a reused tag, creates a numeric-ID
recoverable draft, uploads the complete package set, reads sizes and hashes back,
and only then publishes the release. Workflow timing, source commit, unsigned
status, asset hashes, and dim-sum catalog metadata are recorded in the notes.

GitHub Actions does not run tests, lint, or static-analysis jobs. Those checks
remain local project commands and their actual results are reported separately
from release publication. A published installer is not presented as a test
verdict.

`MATERIAL_OLLAMA_BUILD_MODE=release-fast` selects the frontend's
`build:release-fast` script, which invokes Vite without the normal type-check
stage. The release workflow sets this mode explicitly. Ordinary local builds
retain the normal frontend `build` script.
The frontend preparation builds its response-type generator from the module's
locked Go dependency, runs only the `tscriptify` directive in `app/ui`, installs
frontend packages with `npm ci`, and bundles once after type generation. It does
not run repository-wide generators, install global TypeScript, or invoke the
second normal frontend build declared by the unrestricted Go generation route.

The current accelerated packaging repair did not run tests or UI captures after
the workflow switched to accelerated delivery. Controlled package/PE fixtures
test verifier behavior only and are not proof that the real application installs
or runs. Real installation, WebView2 provisioning, shortcuts and update restart
remain separate runtime evidence requirements.
