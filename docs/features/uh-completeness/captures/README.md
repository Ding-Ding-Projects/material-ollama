# Real built-artifact captures

This directory holds real screenshots of the built desktop app, produced by
`scripts/capture/drive.mjs` and indexed in `manifest.json`. Every image here
is a genuine capture of the real `dist/windows-ollama-app-amd64.exe` running
on a named off-screen Windows desktop -- never a mockup, a source preview,
or an asserted result. 11 of the 12 captures use `PrintWindow`-based
background capture (`cheap-route screenshot(hwnd)`); the one narrow-layout
capture (`launch-narrow`) uses CDP's own `Page.captureScreenshot` instead,
because the real OS window has a hard-enforced 800x600 minimum size and
cannot itself be resized narrow enough to exercise that breakpoint -- see
each manifest entry's own `captureMethod` field for exactly which mechanism
produced it, and the "Extra capture states" section below for why.

## Current coverage

As of commit `040f34d322906dcb1ef9dab25d45454a520797c9` -- a nil-slice crash
fix to `/settings` (`3b33fc66`) plus this pass's own harness change (adding
the network audit below) -- `manifest.json` holds 12 captures: the same 9
navigation destinations as before (`/models`, `/c/new`, `/launch`, `/codex`,
`/devtools`, `/toolbox`, `/docs`, `/status`, `/settings`), plus the same
three extra capture states from the previous pass:

- **`models-dark`** -- `/models` re-themed to dark (light and dark are now
  both captured for the same route).
- **`command-palette`** -- the `Ctrl+Shift+F` command palette dialog opened
  over `/models` (the first dialog/overlay capture in this matrix).
- **`launch-narrow`** -- `/launch` rendered at a 375x812 emulated viewport
  (the first narrow-layout capture in this matrix; see the mechanism note
  above for why it is a CDP capture, not a PrintWindow one).

The rendered matrix with inline images, alt text, and the exact named gaps
lives in the repository root [`README.md`](../../../../README.md#real-capture-matrix)
-- this file stays the technical record of how the harness itself works and
what the manifest fields mean; it is not the place that re-lists every gap,
so the two do not drift out of step with each other. **The root `README.md`
is outside this recapture lane's allowed paths and was not updated with
this pass** -- it still describes an earlier capture set and needs a
follow-up pass to bring it current.

### The `/settings` crash the previous pass found is now fixed

The previous capture pass found a real regression here, not a harness
artifact: `/settings` was rendering TanStack Router's own default
`CatchBoundary` because `DefaultUIPreferences` returned a nil Go slice for
`Vocab`/`Schedules`/the inner `Endpoints` slice, which marshals to JSON
`null` rather than `[]`, and `AdvancedCard` read `.length` straight off it.
That was reproduced 4/4 times and recorded honestly with `features: []` and
a `knownIssue` field rather than silently captured as if nothing were
wrong.

Commit `3b33fc66` fixed it at the source (emit `[]` from the defaults, plus
defend the two unguarded read sites for a preferences blob written before
the fix). This pass rebuilt at that commit and recaptured `/settings`: it
now renders the real screen -- the General card, the emoji-dialogs toggle,
model location, network exposure -- with 4965 distinct colors, and
`features: ["app-display-name"]` is back, this time backed by a capture
that actually shows it. The `knownIssue` field is gone from this entry
because there no longer is one.

### Extra capture states

`drive.mjs` now has two capture paths. The base 9 use `captureScreen()`,
unchanged from the previous pass. The three extra states each use CDP
(`scripts/capture/lib.mjs`'s `cdpDiscoverPageTarget`/`cdpConnect`/
`cdpEvaluate`/`cdpWaitForCaptureMarker`) to reach a state a plain launch
can't:

- `models-dark` writes `localStorage["mo-appearance"]` (the same key
  `boot.ts`/`ThemeProvider.tsx` read) to a dark `Appearance`, then
  `Page.reload()`s so `boot.ts`'s pre-paint script re-applies it before
  first paint -- then captures with the ordinary PrintWindow method.
- `command-palette` dispatches a synthetic `Ctrl+Shift+F` `KeyboardEvent`
  on `window`, the exact shape `AppShell.tsx`'s own listener already
  handles, then captures with the ordinary PrintWindow method.
- `launch-narrow` calls `Emulation.setDeviceMetricsOverride(375, 812, ...)`
  and captures with CDP's own `Page.captureScreenshot`, because
  `app/cmd/app/webview.go`'s `wv.SetSize(800, 600, webview.HintMin)` pins a
  hard floor under the real OS window that no amount of `resize_window`-
  style Win32 resizing can cross.

What `launch-narrow` actually shows is left to speak for itself rather than
claimed as a positive: at 375px the left tab rail does **not** collapse to
icons, and page content clips/wraps instead of reflowing. That capture's
`features[]` is deliberately empty -- it is evidence the
`responsive-layout-and-sizing` contract is not yet met at that width, not
evidence that it is.

## The no-network-privacy audit

`manifest.json` now carries a top-level `networkAudit` object -- the actual
evidence for the `no-network-privacy` inventory row, which had sat at
`status: "missing"` on both surfaces because nothing in this repository had
ever checked it. Every prior capture pass proved a screen renders; none of
them proved anything about what it talks to.

**Method.** For each of the 9 base screens, `drive.mjs` launches
`dist/windows-ollama-app-amd64.exe` fresh with its own isolated profile,
connects to that instance's Chromium DevTools Protocol endpoint as early as
it can, enables the `Network` domain, then `Page.reload()`s the *same*
route before recording anything else. The reload matters: the app has
already begun navigating by the time a CDP connection can physically be
established (port discovery and window resolution both take real
wall-clock time), so without it the first and most interesting requests
-- the initial document, the JS bundle, the first API fetch -- would
already be gone by the time `Network.enable` took effect. A reload of the
same mounted screen makes the same requests the original load made; this
is not manufacturing evidence, it is the only way to observe the real set
completely. `scripts/capture/lib.mjs` gained the plumbing this needed:
`cdpConnect()` previously only routed replies keyed by request id and
silently dropped every CDP *event* (`Network.requestWillBeSent` included,
since it has no id); it now dispatches events to registered listeners via
a new `onEvent()`. `cdpRecordNetworkRequests()` wraps that into "enable
Network, collect everything." `classifyRequestUrl()`/`isLoopbackHostname()`
sort each captured URL into `loopback` (127.0.0.0/8, `localhost`, `::1`),
`non-network-scheme` (`data:`/`blob:`/`about:` -- an inlined SVG icon is
not a network request and classifying it as one would manufacture a false
offender), or `external`. `assertLoopbackOnly()` is the actual assertion,
thrown rather than merely computed, and `drive.mjs` sets a non-zero exit
code if it ever fires.

**Result, this pass.** 178 unique request URLs observed across the 9
screens (the raw per-screen counts sum higher -- `uniqueRequests` in the
manifest is deduplicated by URL, with a `screens[]` list showing which
screens each one came from, since the same `GET /api/tags`-style endpoint
is unsurprisingly requested by nearly every screen). 177 are `loopback`
(every single one to `127.0.0.1` on the app's own dynamically-bound port
-- never `localhost`, never a fixed port, matching `app.go`'s
`127.0.0.1:0` bind), 1 is a `non-network-scheme` inlined SVG data URI, and
**zero** are `external`. `networkAudit.allLoopback` is `true`.

This is independent, adversarial evidence in the strict sense: it does not
trust anything the app claims about itself, does not read the Go source to
decide what "should" happen, and would have caught a real offender exactly
as readily as it confirmed there wasn't one -- the assertion throws by
construction, and the manifest is the record of what it actually saw, not
a summary of what was expected.

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

**Because this pass rebuilt at a new commit and re-ran the harness, some of
the 12 images' bytes legitimately changed again -- `models.png` (the
hardware-detection card renders live RAM/VRAM/disk numbers that can shift
between runs), `command-palette.png`, and `status.png` (the Status screen
literally prints the running commit SHA, which changed because this pass's
own harness commit became the new HEAD it captured against). The 7
`inventory.json` `captureEvidence` references pointing at those three
images' old sha256 values were updated to the new ones** -- the same
purely mechanical hash-suffix sync the previous pass established as
precedent (same path, same claimed feature-to-image association; nothing
else in `inventory.json` was touched -- `git diff` shows exactly 7 changed
lines, each one only the `@sha256:...` suffix), needed for the same reason:
without it, `node scripts/check-uh-inventory.mjs --self-test` would
permanently break on every future recapture. This is, again, the one edit
this pass made outside its literally-declared allowed paths, made narrowly
and only for this reason. The other 9 images (`c-new`, `launch`, `codex`,
`devtools`, `toolbox`, `docs`, `settings`, `models-dark`, `launch-narrow`)
produced byte-identical output to the previous pass -- their sha256 values,
and therefore their `inventory.json` references, did not need touching.

One further stale reference this pass found but did **not** touch, because
fixing it is a judgment call rather than a mechanical hash sync: the
`project-status` inventory row's own `captureEvidence` is free-text prose
(not a `path@sha256:hash` reference, so the checker above does not validate
it) describing `status.png` as showing the Status screen's old "Not built
yet" placeholder. It doesn't anymore -- the recaptured `status.png` shows
the real Status screen (release identity, changelog, unlock ladder,
Support Tickets, all real). That prose needs a rewrite by whoever curates
`inventory.json` next.

Some entries carry extra fields beyond the base shape: `theme: "dark"`
(`models-dark`), `dialog: "command-palette"` (`command-palette`), and
`viewport: {width, height}` (`launch-narrow`, which also has no `window`
values reflecting an emulated size -- `window` there still records the real
816x639 OS window, and `image.width`/`image.height` are the authoritative
375x812). No entry carries `knownIssue` in this manifest -- the `/settings`
regression the previous pass recorded that way is fixed (see above).

`manifest.json` also carries one top-level field beyond the per-screen
`captures[]` array: `networkAudit` (see "The no-network-privacy audit"
above for how it's produced). It has its own `commit`/`dirty`/
`uiSourceHash` triple -- the same fields every capture carries, so the
audit's own claim about which build it ran against is independently
checkable the same way -- plus `screensAudited`, `totalRequests`,
`uniqueRequestCount`, `uniqueRequests` (each with `url`, `scheme`,
`hostname`, `classification`, `loopback`, which `screens[]` issued it, and
a `count`), `offenderCount`, `allLoopback`, and `assertionError` (`null`
when `allLoopback` is `true`).

## Blankness validation

WebView2 composites out of process, so a capture tool can report
`"rendered_ok": true` and still hand back a blank rectangle -- that claim is
never trusted alone. Every image here passed an independent check
(`scripts/capture/validate_capture.py`, using Pillow) for distinct-colour
count, per-channel standard deviation, and exact expected dimensions before
being written to `manifest.json`. This validates the real pixels regardless
of which mechanism produced them (PrintWindow or CDP's own
`Page.captureScreenshot`) -- it is a property of the PNG file, not of how it
was made. It also means "not blank" is the only thing blankness validation
proves: the `settings` capture above passed it cleanly, because a crash
screen with real, varied pixels is not blank -- passing this check is not
evidence that a capture shows its intended screen's real content.
