# Browser Extension Download Capture

## Behaviour

**Not applicable to the desktop-app surface, verified rather than assumed.** This contract row describes a Start-download dialog, a separate Downloading progress dialog, and an always-on-top completion dialog/notification that a browser-extension capture handoff must produce. This repository ships no browser extension of any kind: no `manifest.json` anywhere in the tree declares a `manifest_version` field (the one thing that actually makes a `manifest.json` a WebExtension manifest, as opposed to, say, a package manifest with an unrelated shape), and no committed source file references the `chrome.runtime`/`browser.runtime` WebExtension API. There is consequently no capture-handoff surface for this row's contract to apply to on the desktop-app surface: no extension-triggered download queue item, no Downloading dialog, no completion notification tied to an extension handoff.

This is recorded as `not-applicable` rather than `missing` deliberately: the contract does not silently disappear because it is inconvenient — it is checked, found to have no real subject on this surface, and that finding is itself made checkable (see Verification below) so a future browser extension added to this repository would immediately surface the gap this row's real contract (the three dialogs, and their built-artifact capture proof) would then require, rather than the `not-applicable` status quietly going stale.

## Configuration

Not applicable.

## Failure modes

Not applicable — there is no capture-handoff flow to fail.

## Security considerations

Not applicable.

## Verification

- Focused tests: `scripts/test/browser-extension-download-capture.test.mjs` (`node --test scripts/test/browser-extension-download-capture.test.mjs`) — two tests: no committed `**/manifest.json` file anywhere in the tracked repository declares a `manifest_version` field; no committed `.ts`/`.tsx`/`.js` source file references `chrome.runtime`/`browser.runtime`.
- Both were deliberately broken to prove the guard actually notices a real extension appearing: a scratch `manifest.json` declaring `{"manifest_version": 3, ...}` was staged and confirmed to fail the first test, naming that exact file; a scratch `.ts` file referencing `chrome.runtime.id` was staged and confirmed to fail the second, naming that exact file. Both scratch files were then unstaged and deleted, and the tests re-confirmed passing.
- Run: `node --test scripts/test/browser-extension-download-capture.test.mjs`.

## Suggested articles

- `landing-page-boundary.md` — another row whose desktop-app-surface answer is about an absence (no embedded runtime) rather than a built feature, checked the same way: by scanning for the thing that would make the claim false.
- `no-network-privacy.md` — a genuinely-applicable row on this same surface, for contrast with a not-applicable one like this.
