# Site Homepage Link

## Behaviour

The repository's own GitHub homepage field points at the project's landing site — verified with `gh repo view Ding-Ding-Projects/material-ollama --json homepageUrl`, which returns `https://material-ollama-day-teet-hui.halowbak123.chatgpt.site`. This is what renders under the repository description in GitHub's own sidebar, and is what `README.md` links under "Hosted landing URL."

On the desktop-app surface specifically, the Status screen's release card (`ReleaseCard.tsx`) carries a real, always-visible **"Visit the project website"** link (`t("visitWebsiteLink")`, both English and the Cantonese `去項目網站睇睇`) pointing at the exact same URL, exported as `PROJECT_HOMEPAGE_URL` from `app/ui/app/src/screens/status/changelogEntries.ts` — the same file that already exported `CHANGELOG_REPO_URL` for the changelog's own commit links, so both project-identity URLs live in one place rather than being duplicated per call site. The link is a real `<a>` element with `target="_blank" rel="noopener noreferrer"`, opening the site in the user's default OS browser rather than inside the app's own window — see `landing-page-boundary.md` for why that distinction matters.

## Configuration

The URL is a stable project fact (the repository's own GitHub homepage), not a per-user setting — there is nothing to configure.

## Failure modes

Not applicable in the ordinary sense: the link is a plain external anchor with no network call of its own to fail. If the site itself is unreachable, the browser (not this app) reports that; the app's own state is unaffected either way.

## Security considerations

The link opens in a new OS-browser tab rather than navigating the app's own window (`target="_blank"`) and carries `rel="noopener noreferrer"`, so the opened page cannot obtain a reference back to the originating window (`window.opener`) and cannot be used to redirect the app's own window out from under the user.

## Verification

- Focused tests: `app/ui/app/src/screens/status/ReleaseCard.dom.test.tsx` — `"links to the repository's real GitHub homepage, as a real anchor a user can open"` asserts the rendered link's `href` equals exactly the URL `gh repo view` reports for this repository's own homepage field; `"opens the site in a new tab via a real anchor, never as an embedded route inside this window"` asserts it is a real `<a>` tag with `target="_blank"` and a `rel` containing `noopener`, and that no `<iframe>`/`<webview>` exists anywhere in the rendered card.
- Repo-wide guard: `app/ui/app/src/test/sourceGuards.test.ts`, `landing-page-boundary guard > "routes the site's homepage link out via a real anchor (target=_blank), never a same-window navigation"` — scans every `.tsx` file for any `<a>` tag referencing `PROJECT_HOMEPAGE_URL`/the literal homepage host, and fails if any such anchor is missing `target="_blank"`; also asserts at least one such link genuinely exists (so this guard cannot pass merely because the link was removed).
- Run: `cd app/ui/app && npx vitest run src/screens/status/ReleaseCard.dom.test.tsx src/test/sourceGuards.test.ts`.
- Real command verification: `gh repo view Ding-Ding-Projects/material-ollama --json homepageUrl` → `https://material-ollama-day-teet-hui.halowbak123.chatgpt.site` (matches both `README.md`'s link and the in-app constant exactly).

## Suggested articles

- `landing-page-boundary.md` — why this link is a real external anchor rather than an embedded route, and the broader boundary that keeps the site from being offered as a substitute runtime.
- `status-hub.md` — the Status screen this link lives on, and the rest of the release-identity evidence it shows alongside it.
- `shared-link-embed.md` — the graphic shown when the site's own URL (this same one) is pasted into a chat client.
