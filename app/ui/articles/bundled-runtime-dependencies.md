# Bundled Runtime Dependencies

## Behaviour

The desktop app's UI ships every font, icon, and static asset it renders inside its own build output — never fetched from a CDN, a Google Fonts URL, or any other network host at runtime. Fonts (`roboto-flex-latin-standard.woff2`, `roboto-mono-latin-400.woff2`, `roboto-mono-latin-500.woff2`) live at `app/ui/app/src/assets/fonts/` and are referenced by local, relative `@font-face src: url(...)` paths that the bundler resolves and inlines into the build — never an absolute `http(s)://` reference. The icon set (Material Symbols glyphs) is a single local sprite, `app/ui/app/src/assets/icons.svg`, referenced by `<use href="/src/assets/icons.svg#...">` — again a bundled asset, not a remote icon font served from `fonts.googleapis.com` or `fonts.gstatic.com`.

This means the app's own chrome — text, icons, layout — renders identically whether or not the machine has network access, and never leaks a request to a third-party asset host merely by being open. This is a narrower, source-level claim than `no-network-privacy.md`'s live-request audit: this row is about what the *source* declares as a dependency, and the other is about what the *running app* actually requests — the two are complementary evidence for the same underlying fact.

## Configuration

There is no user-facing configuration for this — bundling is a build-time property of the source tree, not a runtime toggle. A maintainer adding a new font or icon must add it as a committed local asset under `app/ui/app/src/assets/`; there is no supported path for referencing an external font/script/style host, and the guard test below enforces that as a structural property of the codebase rather than a style guideline.

## Failure modes

Because every asset is bundled, there is no "offline degraded mode" to speak of for fonts and icons specifically — they are always present, at every screen, with or without network access. A missing local asset file would surface as an ordinary build-time bundler error (a failed `url()` resolution), not a runtime fallback to a remote host, since no such fallback exists in the source.

## Security considerations

Loading fonts, scripts, or stylesheets from a third-party CDN at runtime would leak the fact that this specific app is running (and when) to that CDN operator, and would make the app's rendering dependent on a remote host's availability and trustworthiness. Bundling everything locally removes that exposure entirely — this is a privacy property as much as an offline-availability one, and it is the same discipline `no-network-privacy.md`'s live audit independently confirms at runtime.

## Verification

- Focused test: `app/ui/app/src/test/sourceGuards.test.ts`, describe block `bundled-runtime-dependencies guard` — two tests. The first walks every real source file under `app/ui/app/src/` (excluding test/fixture files) and fails if any file's raw text references `fonts.googleapis.com`, `fonts.gstatic.com`, `cdn.jsdelivr.net`, `unpkg.com`, `cdnjs.cloudflare.com`, or `jsdelivr.net`. The second specifically parses every `@font-face` block in the stylesheet tree and fails if any `url(...)` reference inside one is an absolute `http(s)://` URL rather than a bundled/relative path.
- Both checks were deliberately broken to confirm they actually catch a real violation: a scratch source file referencing `fonts.googleapis.com` in a comment was added and confirmed to fail the first check, then removed and re-confirmed passing.
- Run: `cd app/ui/app && npx vitest run src/test/sourceGuards.test.ts`.
- Complementary runtime evidence: `no-network-privacy.md`'s live CDP-recorded audit of the actual running app (`docs/features/uh-completeness/captures/manifest.json`'s `networkAudit` field) independently confirms the app never actually requests a non-loopback host while rendering the screens these bundled fonts/icons appear on.

## Suggested articles

- `no-network-privacy.md` — the runtime counterpart to this source-level guard: what the built, running app actually requests over the network (nothing but loopback).
- `packaged-app-icon.md` — another local, committed, build-time-only asset (the packaged `.ico`), following the same "bundled, never fetched" discipline.
- `offline-documentation-browser.md` — the in-app docs browser, which similarly bundles every article at build time rather than fetching them.
