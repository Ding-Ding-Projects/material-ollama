# Windows build and release documentation

This index covers the project-owned Windows build and native package route. It
does not claim that source documentation is evidence of a built or published
installer.

## Build entry point

Run the fresh-machine build and explicit launch from the repository root:

```powershell
.\build.bat --run
```

For an accelerated release candidate, the final integrated commit uses:

```powershell
$env:MATERIAL_OLLAMA_BUILD_MODE = 'release-fast'
.\build.bat /s --release-fast
.\build-installer.bat /s
```

The root commands build native Go payloads and unsigned Squirrel.Windows
packages. They do not build an Electron `app.asar` file, publish a release, or
prove installation, runtime behavior, or user-interface behavior. The
accelerated path intentionally omits tests, lint, reviews, audits, and captures.

## Articles

| Article | Scope |
| --- | --- |
| [Root Windows build entry points](./root-build.md) | Fresh-machine tool bootstrap, source binding, receipts, launch semantics, and fast release mode. |
| [Native Squirrel lifecycle and offline WebView2 recovery](./squirrel-lifecycle.md) | Lifecycle callbacks, offline runtime readiness, identity preservation, and built-package verification boundary. |
| [Release workflow](../../../release.md) | Squirrel package contents, unsigned-policy boundary, release assets, and publication evidence. |

## Candidate evidence boundary

The published `v0.0.0-build.47` release is an older unsigned Inno Setup
installer. The current Squirrel source remains an unpublished candidate until a
new installer is built from the final integrated commit and the actual release
assets are read back. Record a tag, commit, asset size, hash, or download URL
only after that result exists.
