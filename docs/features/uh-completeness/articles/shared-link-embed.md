# Shared Link Embed

## Behaviour

The repository ships a real, product-specific graphic — `social-preview.png`, committed at the repository ROOT — for GitHub's own social-preview mechanism (what renders when the repository link is shared) and as the source image for a future page-level Open Graph embed. It is not a stock photo, not a generic gradient-with-a-word-on-it, and not GitHub's own auto-generated repository-metadata card: it is composited directly from this project's real assets by `scripts/build-social-preview.mjs`.

The graphic is built at 1280×640 (GitHub's own recommended social-preview size) by:

1. Reading this project's own two brand gradient stops straight out of the committed vector master (`app/assets/material-ollama-mark.svg`) — the exact same `<stop stop-color="#...">` pairs `scripts/build-app-icon.mjs`'s icon pipeline reads — and filling the whole card with a diagonal gradient between them, so the background can never silently drift from the mark's own real colors.
2. Decoding the already-committed, already-verified `app/ui/app/public/icons/icon-512.png` (a real rasterization of the same master SVG, produced and read-back-verified by `packaged-app-icon.md`'s icon pipeline) with a small, deliberately narrow PNG decoder matched exactly to this project's own encoder's fixed output shape.
3. Alpha-compositing that icon, resized to 440px, centered on the card — the mark's own rounded-square background is genuinely transparent at its corners (the SVG's `rx` rounding), so this produces a real rounded-logo-on-gradient-card look rather than a plain square stamped on top.

It is committed at the repository root specifically — not `docs/assets/` or `app/assets/` — because GitHub's social-preview upload is a manual step (there is no API/CLI to set it), and a file four directories deep is a step that quietly does not happen; at the root, it is the first thing anyone opens when told "drag this file into Settings → General → Social preview."

## Configuration

Not applicable at runtime — regenerating the graphic after the mark changes is `node scripts/build-social-preview.mjs`.

**Outstanding manual step**: GitHub's repository-level social-preview upload cannot be performed via `gh`/the REST API (there is no supported endpoint), so it remains a one-time manual action for a repository owner: Settings → General → Social preview → Upload an image → select the repository-root `social-preview.png`. This is stated here explicitly rather than silently claimed complete, per this project's own evidence discipline.

## Failure modes

If the master SVG or the source `icon-512.png` ever changes without regenerating `social-preview.png`, the committed file becomes stale — caught by `node scripts/build-social-preview.mjs --check`, which re-derives the whole card from the current source bytes and diffs against the committed file, failing loudly (rather than silently serving an outdated card) the moment they disagree.

## Security considerations

Not directly security-relevant. The generator reads only local, already-committed files and Node's own standard library (`zlib` for PNG deflate/inflate; no third-party dependency, no network access) — consistent with `bundled-runtime-dependencies.md`'s broader "everything this project generates comes from local, committed sources" discipline.

## Verification

- Focused tests: `scripts/test/shared-link-embed.test.mjs` (`node --test scripts/test/shared-link-embed.test.mjs`) — four tests: the file exists at the repository root (not nested); it is a genuine, correctly-sized (1280×640) PNG; it is byte-identical to what `--check` currently re-derives from the real master SVG and icon; and it is large enough (>10KB) to plausibly be a real composited image rather than a blank placeholder.
- All four were deliberately broken (the committed file was overwritten with 3 garbage bytes) and confirmed to fail — the size check, the byte-identity `--check`, and the too-small-to-be-real check all failed simultaneously, each naming its own specific problem — before the original file was restored (confirmed byte-identical via `cmp`) and every test re-confirmed passing.
- Run: `node --test scripts/test/shared-link-embed.test.mjs`.
- Implementation: `scripts/build-social-preview.mjs`; output: `social-preview.png` (repository root, 27,749 bytes, 1280×640, 58 distinct sampled colors confirming a genuine composite rather than a solid fill).

## Suggested articles

- `packaged-app-icon.md` — the same master SVG and the same generated `icon-512.png` this graphic is composited from.
- `site-homepage-link.md` — the URL this graphic would accompany when the site's own link (rather than the repository's) is shared.
- `landing-page-boundary.md` — the broader distinction between the app/repository and the site this graphic represents.
