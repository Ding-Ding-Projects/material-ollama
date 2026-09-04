# Root Windows build entry points

Run `build.bat --run` from the repository root to acquire the pinned tools, build the native Windows desktop payload, validate it, and launch the matching host-architecture executable. `/run` and `RUN_AFTER_BUILD=1` select the same explicit launch action.

`build.bat /s` (also `--silent` or `SILENT=1`) is non-interactive and does not launch unless an explicit run choice is present. Without silent mode, a successful complete build asks whether to launch. A failed build never asks.

## Shared execution and provenance

`scripts/root-build-manifest.json` owns the build script, supported step names, complete default step list, native executable paths, and receipt paths. The default builds the x64 and ARM64 CPU payloads, command-line programs, desktop programs, and runtime dependencies. The interface is embedded in the Go executables, not a separate web-runtime archive.

The root PowerShell process activates prerequisites before starting child tools. `download-dependencies.bat` uses the same activation route and returns its verified process PATH to a calling command script across `endlocal`; it never asks the caller to reopen a terminal. Portable tool versions and canonical download digests live in `scripts/root-prerequisites.json`.

The source must be committed and clean before a build. The root records commit, source tree, index tree, dependency manifest, prerequisite manifest, and root build manifest identity. It requires the same identity after building and again before launch. A complete build removes the previous payload receipt before starting. Launch requires a newly produced native payload receipt whose current source identity, required executable inventory, nonempty file sizes, and SHA-256 values match the files on disk. A partial step build may finish successfully, but cannot certify or launch a complete application.

## Fast release mode

`build.bat /s --release-fast` skips the inventory self-test and quality inventory check. `MATERIAL_OLLAMA_BUILD_MODE=release-fast` selects the same route for callers such as `build-installer.bat`. It does not skip the vocabulary currency check, clean-source check, manifest binding, native payload verification, or the installer's unsigned Squirrel checks. This mode runs no test or capture suite and must not be described as test or runtime verification.

## Failure and verification status

Unknown step names and partial-build launch requests fail before building. Child process exit codes are preserved. Missing or changed receipts, file hash mismatches, and changes to the source during the build prevent launch. A compatible tool already on the machine may be reused; missing tools use the pinned portable acquisition route without administrator rights or manual installation instructions.

The fast release repair did not run local behavioral suites or UI captures. A successful real build proves that its output was produced and validated; it does not prove fresh-machine bootstrap or runtime interaction. Those remain separate checks.

Suggested articles: [Windows development](../../../development.md).
