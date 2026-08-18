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

The 7-Zip bootstrap treats the manifest version as a minimum. It first reads the exact local
Chocolatey package record and reuses an equal or newer installed `7zip.install` version after
verifying that `7z.exe` is usable on `PATH`. A missing or older package receives the pinned
installation request. If the install or either package probe cannot produce a usable package,
the workflow fails with the observed versions, exit codes, and command output rather than
silently continuing with an unverified archive tool.

The package is unsigned by project policy. The workflow fails if signing inputs are present and verifies that `OllamaSetup.exe` has Authenticode status `NotSigned`. Windows may show an unknown-publisher or SmartScreen warning.

## Release evidence

Each successful build uploads its `dist` tree, SHA-256 manifest, line-count table, JSON line-count data, and release metadata even when a preceding build step fails. The committed [`scripts/count-lines.mjs`](../scripts/count-lines.mjs) reports source, tests, styles/markup, generated, and other categories with total and non-blank lines, plus surviving-line attribution from `git blame`. Vendored trees, dependency directories, generated build output, and lockfiles are excluded explicitly.

[`scripts/release-metadata.mjs`](../scripts/release-metadata.mjs) resolves one unused code name from the public dim-sum catalog and a published `catalog-v1` image URL. The release records that metadata without copying catalog images into this repository.

Release tags use the source version plus the monotonic workflow run number, for example `v0.0.0-build.42`. The workflow refuses to reuse an existing tag, creates a non-draft release against the exact triggering commit, uploads every verified asset, and reads the published release back to confirm its target and assets.

GitHub Actions does not run tests, lint, or static-analysis jobs. Those checks remain available as local project scripts and are reported separately from release publication; an artifact publication is not presented as a test verdict.
