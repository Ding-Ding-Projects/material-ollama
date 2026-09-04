# Native Squirrel lifecycle and offline WebView2 recovery

This article defines the native desktop integration contract. Source-level checks alone do not establish that a released installer satisfies it. Installation, shortcuts, first launch, and recovery require separate evidence from the built Windows package.

## Lifecycle callbacks

The native Go desktop entry point calls `handleSquirrelLifecycle(os.Args[1:])` before normal initialization. A handled callback returns before opening the interface, starting the server, or attempting WebView2 installation.

| Argument | Required behavior |
| --- | --- |
| `--squirrel-install` | Ask the installation's parent `Update.exe` to create Desktop and Start Menu shortcuts. |
| `--squirrel-updated` | Recreate those shortcuts for the updated installation. |
| `--squirrel-uninstall` | Ask the same updater to remove those shortcuts. |
| `--squirrel-obsolete` | Exit without normal startup. |
| `--squirrel-firstrun` | Continue through normal startup, including runtime readiness checks. |

The shortcut operation uses the executable's installation directory to resolve `../Update.exe`, with separate arguments `--createShortcut=ollama app.exe` and `--shortcut-locations=Desktop,StartMenu`. Removal uses `--removeShortcut=ollama app.exe` with the same locations. The executable name containing a space remains one argument; no shell command concatenation is needed. Lifecycle handling has a 12-second upper bound and reports unsuccessful updater execution instead of continuing into normal startup.

The native PE version resource must contain `SquirrelAwareVersion=1`. Handling arguments in Go without producing that resource is incomplete: Squirrel must recognize the executable as lifecycle-aware. This follows the upstream [non-C# integration contract](https://github.com/Squirrel/Squirrel.Windows/blob/develop/docs/using/custom-squirrel-events-non-cs.md).

`app/ollama.rc` supplies that version-resource string and embeds `app/ollama.exe.manifest` as resource 1 of type 24 (`RT_MANIFEST`). The manifest explicitly requests `asInvoker` with `uiAccess=false`, so normal startup and lifecycle callbacks request no elevation. The existing architecture-specific `windres` command resolves the manifest through its `app/` include directory and produces `ollama_windows_<arch>.syso` beside the Go entry package. The build must not silently omit these resources if the resource compiler is unavailable. No generated `.syso` is committed, and the resource additions do not change package IDs or the user-data directory.

## Runtime readiness on normal startup

`ensureBundledWebView2(ctx)` checks the 32-bit registry view, inspecting machine registration (`HKLM`) before current-user registration (`HKCU`). A usable candidate needs a valid registered `pv` version, the corresponding `ClientState` `EBWebView` location, and an actual runtime DLL for the desktop process architecture. A registration string by itself is not proof that the runtime is usable.

The minimum supported version is `151.0.4129.101`, pinned for both x64 and ARM64 in [release-dependencies.json](../../../scripts/release-dependencies.json). An absent, older, incomplete, or architecture-incompatible registration triggers the bundled recovery path. Only the matching bundled `webview2/MicrosoftEdgeWebView2RuntimeInstallerX64.exe` or `webview2/MicrosoftEdgeWebView2RuntimeInstallerARM64.exe` is eligible. Validate its bytes against the compiled pinned SHA-256 and enforce input and execution bounds before launching it hidden with `/silent /install`.

The runtime installation attempt is bounded to two minutes. After it exits, repeat readiness detection; exit status zero alone is insufficient. A missing bundle, invalid digest, timeout, failed installation, or unusable post-install runtime is a startup failure with a concrete diagnostic. Do not silently substitute an online bootstrapper or start the interface against an unverified runtime.

Microsoft documents registry-based detection and silent Evergreen Standalone Installer deployment in [Distribute your app and the WebView2 Runtime](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution). The bundled installer provides the offline distribution route; the project's architecture, minimum-version, digest, and deadline checks are additional local requirements.

## Identity and preservation

The fixed Squirrel package IDs are `MaterialOllamaX64` and `MaterialOllamaArm64`. They separate installed architecture identities and must not derive from a customizable display name. Lifecycle processing preserves `%LOCALAPPDATA%/Ollama` user data. It does not automatically uninstall an older Inno Setup installation or terminate unrelated processes. Any migration of a separate installation needs an independently scoped, explicit operation.

## Verification boundary

Focused isolated-file Go tests can exercise argument dispatch, shortcut arguments, timeout handling, runtime selection, and validation logic. They do not prove PE resource inclusion, Squirrel recognition, real shortcut creation/removal, offline runtime installation, or successful desktop startup.

Before reporting installation as verified, drive the actual unsigned Squirrel package on an isolated hidden desktop and record its source commit and package hash. Confirm the lifecycle callbacks return within their bound, first-run proceeds normally, shortcuts target the intended installation, the packaged runtime installer is selected when needed, post-install readiness succeeds, and existing user data survives. A test result without that built-package evidence must remain explicitly limited to the behavior it exercised.

## Suggested articles

- [Development workflow](../../development.md)
- [Pinned release dependency manifest](../../../scripts/release-dependencies.json)
