# Real built-artifact captures

This directory holds real screenshots of the built desktop app, produced by
`scripts/capture/drive.mjs` and indexed in `manifest.json`. Every image here
is a genuine `PrintWindow`-based capture of the real `dist/windows-ollama-app-amd64.exe`
running on a named off-screen Windows desktop -- never a mockup, a source
preview, or an asserted result.

## Running it

```
npm --prefix app/ui/app run build
node scripts/write-build-stamp.mjs
go build -trimpath -ldflags "-s -w -H windowsgui -X=github.com/ollama/ollama/app/version.Version=<ver> -X=github.com/ollama/ollama/app/version.Commit=$(git rev-parse HEAD)" -o dist/windows-ollama-app-amd64.exe ./app/cmd/app/
node scripts/capture/preflight.mjs   # fails closed if any of the above is stale or missing
node scripts/capture/drive.mjs       # captures every screen, writes manifest.json + images/
```

`drive.mjs` runs `preflight.mjs` itself first and refuses to proceed if it
fails, so running `drive.mjs` alone is sufficient once the build steps above
are done.

## Why this needs explorer.exe

The single most important thing to know before touching this harness: **the
app's tray icon cannot reliably initialize on a bare off-screen desktop, and
this is not a bug this branch introduced.**

`osRun()` calls `wintray.NewTray()` unconditionally, before any window is
created, and a failure there is fatal (`log.Fatalf` -> `os.Exit(1)`) with no
fallback. `wintray.NewTray()`'s last step calls `Shell_NotifyIconW(NIM_ADD)`,
which needs a live shell notification host (a `Shell_TrayWnd` window) on
that desktop. A freshly created headless desktop has no shell at all, so
that call fails with `"Unable to init instance: Unspecified error"` -- every
time, on every build, verified against both this branch's own build **and**
the officially shipped 0.32.14 installed binary. It is a real, pre-existing
limitation of the app's Windows startup path, not something specific to this
harness or this branch.

Launching a real `explorer.exe` on the *same* named desktop first (which
`lib.mjs`'s `ensureTrayHost()` does) gives that desktop its own
`Shell_TrayWnd`, after which tray init mostly succeeds. "Mostly" is load-
bearing: the shell's own notification RPC endpoint is not reliably live the
instant `Shell_TrayWnd` exists as a window, so a fixed wait alone is not
enough -- three back-to-back launch attempts against one already-running,
already-settled tray host failed, then two more against that exact same
host succeeded with no other change. `lib.mjs` treats this as what it is (a
retryable race): a 10s settle after `Shell_TrayWnd` first appears
(`TRAY_HOST_SETTLE_MS`), plus up to 6 retries in `launchScreenReliable()`
when a launch fails with that exact error. That combination held for 3/3
and then 6/6 real consecutive runs.

**A follow-up worth filing separately** (out of this lane's allowed paths,
since it touches `app/wintray`): a single notification-icon failure taking
down the entire process with no fallback is a real robustness gap on its
own, independent of headless desktops -- imagine a locked-down environment
where notification icons are policy-restricted.

## Manifest shape

Each entry in `manifest.json`'s `captures[]` records, per screen: the exact
route and resolved URL, the commit/dirty/uiSourceHash the build carried
(matching `write-build-stamp.mjs`'s stamp), the built exe's own path/sha256/
size, the resolved target window's class/title/dimensions, the captured
image's path/sha256/dimensions/distinct-colour-count, and a best-effort
`features[]` list naming which `docs/features/uh-completeness/inventory.json`
feature ids this specific screen visibly demonstrates. That list is a
starting point for a future pass to verify and wire into
`inventory.json`'s `captureEvidence` fields -- it is not itself a claim that
those features are complete, tested, or otherwise done.

## Blankness validation

WebView2 composites out of process, so a capture tool can report
`"rendered_ok": true` and still hand back a blank rectangle -- that claim is
never trusted alone. Every image here passed an independent check
(`scripts/capture/validate_capture.py`, using Pillow) for distinct-colour
count, per-channel standard deviation, and exact expected dimensions before
being written to `manifest.json`.
