# Status Hub

## Behaviour

The desktop app ships its own in-app status surface at `/status` (`app/ui/app/src/screens/status/StatusScreen.tsx`), assembling seven cards, each backed by a real endpoint or a real local computation rather than sample data:

- **`DimSumSurpriseCard`** / **`DimSumCatalogCard`** — the build-embedded dim-sum release catalog and its startup surprise, sourced from `GET /api/v1/release`.
- **`ReleaseCard`** — real release identity (version, commit, workflow run, build timestamp, dim-sum code name when the build is a genuine release rather than a dev build) and the unsigned-by-policy fact, cited against the exact CI assertion that backs it (`app/ui/release.go`'s `unsignedEvidence`), plus a real external link to the project's own homepage (see `site-homepage-link.md`) — from `GET /api/v1/release`.
- **`AutomaticUpdatesCard`** — the real automatic-update setting, read and written through `GET`/`POST /api/v1/settings`.
- **`ChangelogCard`** — built from this repository's own real commit history (see `changelog-viewer.md`), with every entry linking to its real GitHub commit.
- **`LocalHistoryCard`** — real append-only local version-history events from `GET`/`POST /api/v1/history`, with export.
- **`SupportTicketsCard`** — the fully local (School-mode-independent), no-network support desk.

This is the app's own equivalent of the shared Status Hub contract: the same evidence-behind-every-claim discipline, so a user looking at the running app can see genuine release/version/build/update/history state without needing to leave it or trust an external status page. Nothing in this screen is a placeholder — every control that looks operable is wired to something real, and the screen's own header comment states that explicitly.

## Configuration

The screen itself has no configuration surface; the individual cards' underlying settings (automatic updates, School mode's effect on the dim-sum surprise, language mode) are configured elsewhere (the Settings screen) and reflected here live.

## Failure modes

Each card independently handles its own loading/error state against its real endpoint (a progress indicator while `GET /api/v1/release` is in flight; an explicit localized error message if it fails) rather than the whole screen failing as one unit if a single card's data is unavailable.

## Security considerations

Not directly security-relevant; this screen surfaces facts about the running build and local state, none of which is a credential or secret. The Support Tickets card in particular is explicit that nothing it does leaves the machine.

## Verification

- Focused tests: `app/ui/app/src/screens/status/StatusScreen.dom.test.tsx` — two new tests assembling the real container with a combined fetch mock covering every endpoint its child cards use (`/api/v1/release`, `/api/v1/settings` GET/POST, `/api/v1/history` GET/POST): `"assembles every real status card with genuinely fetched data, not a placeholder shell"` confirms the real version string, the unsigned-by-policy fact, the automatic-updates heading, the changelog heading, and a real fetched history event all render together on one screen; `"links the release card's homepage anchor and the changelog's commit anchors to real external URLs, never a same-window route"` confirms both kinds of external link on this screen are genuine `target="_blank"` anchors pointing at real GitHub URLs.
- Each individual card already carries its own focused test file (`ReleaseCard.dom.test.tsx`, `AutomaticUpdatesCard.dom.test.tsx`, `ChangelogCard.dom.test.tsx`, `LocalHistoryCard.dom.test.tsx`, `SupportTicketsCard.dom.test.tsx`, `DimSum.dom.test.tsx`) — this row's new test is specifically the container-level proof that all seven assemble correctly together, which none of the per-card tests individually cover.
- Run: `cd app/ui/app && npx vitest run src/screens/status/StatusScreen.dom.test.tsx`.
- Built-artifact proof: the Status screen is one of the 9 screens with a real capture in `docs/features/uh-completeness/captures/manifest.json` (`status.png`), and is one of the 5 real screens `scripts/capture/audit-network.mjs` navigated to while recording the `no-network-privacy.md` network audit.

## Suggested articles

- `changelog-viewer.md` — the ChangelogCard's own commit-history source and search/filter behavior.
- `local-version-history.md` — the LocalHistoryCard's append-only event log.
- `site-homepage-link.md` — the ReleaseCard's real link to the project's landing site.
- `support-tickets.md` — the fully local, no-network support desk this screen also hosts.
