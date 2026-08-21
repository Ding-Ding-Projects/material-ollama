# Design parity evidence

This category records the checked-in Material Ollama design reference and the
fixed, deterministic comparison contract for the desktop UI. The source of
truth is the hand-written [18-row inventory](./inventory.json); it names every
screen and overlay even when a real built-app route or capture is not yet
available.

## Current state

- The reference HTML and runtime are imported byte-for-byte under `design/`.
- The reference renderer serves those files directly; it does not transcribe
  the design into a second component tree.
- The inventory uses one baseline: light theme, English, School mode off,
  seed `#8a5a00`, radius `16px`, viewport `816x639`, and scale `1`.
- All 18 rows are explicit gaps until the real built application can be
  reached through the approved hidden-desktop capture route. No row claims
  parity, and no capture placeholder is treated as evidence.

## Capture handoff

Run the reference server with:

```text
node scripts/design-reference/reference-renderer.mjs
```

Use the printed route from a fresh hidden-desktop browser, fulfill the
reference's original React, Babel, and Google-font URLs from
`design/vendor/manifest.json` when that manifest has been fetched, and retain
raw PNGs before deriving labelled side-by-side and machine-readable diff
records. A future capture lane must add the real built route, exact tuple
receipts, hashes, tool versions, and a per-row Material Design 3 audit before changing a
row from `gap`.

The checker intentionally accepts an explicit gap only when its reason is
present and `parityClaimed` is `false`:

```text
node scripts/parity/check-design-parity.mjs --self-test
```

The self-test removes a row, route, tuple field, audit component, and evidence
reason, and adds an unapproved deviation in turn. Each mutation must fail;
restoring the baseline must pass.
