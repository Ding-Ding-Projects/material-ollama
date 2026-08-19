# Landing Page Boundary

## Behaviour

The landing/documentation site is a landing, marketing, documentation, download, status, and settings surface — never the installed application, never a playable substitute for it, and never embedded inside the desktop app's own window as though it were part of the app's runtime. `README.md` states this boundary explicitly at the top: *"the landing and documentation site introduces the installed desktop application. It is not the runtime, does not host a model, and is not a playable substitute for the application."*

On the desktop-app surface, that boundary is enforced two ways rather than merely stated:

1. **The app links out to the site; it never loads the site in.** The Status screen's release card offers a real `<a target="_blank" rel="noopener noreferrer">` link to the site (see `site-homepage-link.md`) — clicking it hands the page to the OS's own default browser and leaves the app's own window completely untouched. Nothing in the app renders the site's pages inside an `<iframe>`/`<webview>`.
2. **That absence is checked, not assumed.** `app/ui/app/src/test/sourceGuards.test.ts`'s `landing-page-boundary guard` scans every real `.tsx`/`.ts` source file (excluding Storybook fixture files, which legitimately quote a `<iframe src="...">` string specifically to prove the app's markdown renderer *strips* such content rather than executing it) for any `<iframe>`/`<webview>` tag whose `src` attribute (not `srcDoc`) points at a URL. The one legitimate local iframe in the codebase — `ExportPreview.tsx`'s sandboxed HTML-export preview, which uses `srcDoc` (local content, `sandbox=""`, no network fetch at all) rather than `src` — correctly does not trip this guard, because the contract this row enforces is "never load a remote page as a substitute runtime," not "never use an iframe for anything."

## Configuration

Not applicable — this is an architectural boundary enforced by source-level absence, not a runtime toggle.

## Failure modes

If a future change ever did embed the site (or any other remote URL) into an `<iframe src="...">`/`<webview src="...">` inside the app, the guard fails immediately, naming the exact file and tag. This was confirmed by deliberately planting `<iframe src="https://evil.example.com" />` in a scratch source file and observing the guard fail with that exact offending tag before removing it and re-confirming green.

## Security considerations

Never embedding an arbitrary remote page inside the app's own window means the app's own privileges (its loopback API access, its local file-system reach through its own IPC-equivalent surfaces) are never extended to content the app does not control the origin of. The one sandboxed local-content iframe that does exist (`ExportPreview.tsx`) is deliberately the opposite case: `sandbox=""` (no scripts, no forms, no same-origin, no popups, no top-navigation) applied to content the app itself generated, never to a remote page.

## Verification

- Focused tests: `app/ui/app/src/test/sourceGuards.test.ts`, describe block `landing-page-boundary guard` — `"never loads the landing site (or any other remote URL) into an iframe/webview as a substitute runtime"` and `"routes the site's homepage link out via a real anchor (target=_blank), never a same-window navigation"`. Also `app/ui/app/src/screens/status/ReleaseCard.dom.test.tsx`'s `"opens the site in a new tab via a real anchor, never as an embedded route inside this window"`.
- The iframe-src guard was deliberately broken (a scratch component rendering `<iframe src="https://evil.example.com" />` was added) and confirmed to fail, naming that exact tag, before being removed and re-confirmed passing.
- Run: `cd app/ui/app && npx vitest run src/test/sourceGuards.test.ts src/screens/status/ReleaseCard.dom.test.tsx`.

## Suggested articles

- `site-homepage-link.md` — the one real, permitted way the app references the site: a genuine external anchor.
- `offline-documentation-browser.md` — the app's own in-app documentation surface, which exists precisely so the app does not need to embed the site's docs to offer documentation.
- `no-network-privacy.md` — the broader "this app's own screens never silently reach an external host" property this boundary is one specific instance of.
