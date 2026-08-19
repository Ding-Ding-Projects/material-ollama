# No Network Privacy

## Behaviour

The running desktop app makes no request to any host other than itself (loopback), while the user is looking at any of its ordinary screens. This is verified two ways, deliberately kept separate because they answer different questions:

1. **Source-level**: `bundled-runtime-dependencies.md`'s guard proves the app's *source* never declares a reference to a remote CDN host.
2. **Runtime-level (this row)**: `scripts/capture/audit-network.mjs` launches the real built `dist/windows-ollama-app-amd64.exe` on a named off-screen desktop (the same headless-capture harness `drive.mjs` uses for screenshots), opens a Chrome DevTools Protocol connection to the app's own embedded WebView2 instance, enables the CDP `Network` domain, and records the URL of every single `Network.requestWillBeSent` event fired while navigating through five real screens — Models, Settings, Status, Docs, and Toolbox — each of which independently triggers its own real data fetches (hardware snapshot, installed/running models, settings, release info, offline-docs inventory, and so on).

Every recorded URL is classified by `scripts/capture/lib.mjs`'s `classifyRequestUrl()`: a `data:`/`blob:` URL (never a network request at all) passes unconditionally; an `http(s)://` URL passes only if its hostname is `localhost`, any address in the `127.0.0.0/8` loopback block (not just the bare `127.0.0.1`), or `::1`; anything else — including a private-LAN address like `192.168.x.x`, not only a public internet host — fails. `assertLoopbackOnly()` then requires *every* recorded URL to pass, not merely most of them.

A real run against this project's own built artifact (commit `3b33fc66c42c82b3d9fe0bfb012f85e68fc6ea6f`, `dist/windows-ollama-app-amd64.exe` sha256 `b5b30b27a2532b23f682a0bb4ffdf113a8aa07c11036292e6106e7a5301dd458`) recorded 53 unique requests across the five routes — every JS/CSS chunk, every font, every `/api/v1/*` call, and the app's own HTML shell — and every single one resolved to `127.0.0.1` (on the OS-assigned ephemeral port the app bound itself to) or a `data:` URI. Zero non-loopback requests. The full result, including the complete list of the 53 URLs, is recorded in `docs/features/uh-completeness/captures/manifest.json`'s `networkAudit` field.

This is deliberately not a claim that the app can *never* reach the network under any circumstance — a model pull legitimately fetches from `registry.ollama.ai`, and the Docker/model-catalog features legitimately reach their respective real endpoints when the user explicitly asks for that. It is a claim about what the app's own chrome and idle screens request merely by being open, which is the surface this contract is actually about.

## Configuration

There is no user-facing toggle for this — it is a structural property of what the app's own screens request, verified against the real running binary rather than configured.

## Failure modes

If a future screen's own code accidentally introduces a request to a non-loopback host (a hardcoded analytics endpoint, a forgotten CDN reference), `audit-network.mjs` fails closed: it exits non-zero and writes the exact offending URL(s) into `networkAudit.offenders`, rather than silently passing. The audit does not run on every CI push (it requires a real headless-desktop capture environment); it is evidence collected during a verification pass, recorded durably in the manifest, and its own guard test (`scripts/test/no-network-privacy.test.mjs`) re-validates that recorded result on every run of the fast test suite by independently re-classifying every recorded URL rather than trusting the manifest's own `ok` field.

## Security considerations

This is fundamentally a privacy property: an app whose idle screens phone home to a third party — even just for fonts or analytics — leaks the fact that the app is running, when, and (via IP) roughly where, to that third party. Verifying loopback-only behavior against the real running binary, rather than only asserting it in prose, is what makes this a checkable claim rather than a promise. The private-LAN case (`192.168.x.x` failing exactly like a public host) matters because a request that never leaves the local network segment is still a real request a network observer on that segment can see — "local" and "loopback" are not the same thing, and only the latter satisfies this contract.

## Verification

- Focused tests: `scripts/test/no-network-privacy.test.mjs` (`node --test scripts/test/no-network-privacy.test.mjs`) — 10 tests. Nine are fast unit tests against the pure `isLoopbackHostname`/`classifyRequestUrl`/`assertLoopbackOnly` functions with synthetic URLs (covering the whole `127.0.0.0/8` block, `::1`, `data:`/`blob:` passing unconditionally, a private-LAN host failing like a public one, and an unparseable URL being reported rather than thrown). The tenth reads the real recorded `networkAudit` result from `docs/features/uh-completeness/captures/manifest.json` and independently re-classifies every recorded URL, rather than trusting the manifest's own `ok` field — confirmed to fail when the manifest was hand-edited to claim `ok: true` while still containing a real external URL.
- Real capture: `scripts/capture/audit-network.mjs`, run against the actual built app on 2026-08-19, recording 53 unique real requests across 5 real screens with zero non-loopback offenders. Result recorded at `docs/features/uh-completeness/captures/manifest.json#networkAudit`.
- Implementation: `scripts/capture/lib.mjs` (`isLoopbackHostname`, `classifyRequestUrl`, `assertLoopbackOnly`, `cdpRecordNetworkRequests`, and the CDP event-dispatch support added to `cdpConnect`'s `.on(method, handler)`).

## Suggested articles

- `bundled-runtime-dependencies.md` — the source-level counterpart: no CDN reference exists in the source at all, independent of what the running app is observed to request.
- `capture-manifest.md` — the shared manifest schema `networkAudit` is recorded alongside the per-screen screenshot captures.
- `ollama-suite-manager.md` — the one area of the app that legitimately DOES reach a non-loopback host (a model pull, a registry lookup), by explicit user action rather than merely being open.
