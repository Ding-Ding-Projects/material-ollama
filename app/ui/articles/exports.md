# Exports

## Behaviour

`app/ui/app/src/components/exports/exportFormats.ts` is the one shared exporter every list in this lane's scope is built from: seven real formats (JSON, JSONL, YAML, CSV, TSV, Markdown, HTML), each declaring its own MIME type, extension, and whether it round-trips losslessly. Every format still emits every value regardless of losslessness -- a "lossy" format uses a JSON-text-in-a-cell representation for structure it cannot natively express rather than dropping data -- and `describeExportCaveats()` computes the exact representational caveat (e.g. "CSV will flatten the `tags` column to JSON text") *before* `buildExport()` ever runs, so a caller can disclose it before committing to a download rather than after. `exportFormats.test.ts`'s fourteen cases prove exactly the seven required formats are listed, an unknown format id throws rather than silently returning `undefined`, the empty-list case is named before format-specific work runs, CSV/TSV escaping follows RFC 4180 with CRLF lines, YAML/JSON/JSONL round-trip with no data loss, and -- critically -- "never drops a row or a column across any of the seven formats".

`ExportDialog.tsx` is the real UI over that engine: it opens on JSON (the lossless default) with no caveat shown, switches to a real computed caveat the moment a lossy format is picked and clears it going back, disables Save for an empty list so it can never trigger an empty download, and -- once saved -- offers the external-editor handoff (`external-editor.md`) or a clipboard-copy fallback that is always available even when no editor bridge is wired up. `ExportDialog.dom.test.tsx`'s eight tests prove every one of those states directly, including that Save genuinely triggers a browser download (`useExport.dom.test.tsx`'s "really triggers a Blob-anchor download with the right filename", which also proves the throwaway anchor is appended and removed rather than leaked, and that the object URL is revoked on a timer rather than racing the browser's own download handoff). `ExportPreview.tsx` renders Markdown/HTML through the app's shared provider-authored-text renderer (HTML specifically through a sandboxed iframe, never injected into the page) rather than printing raw source, and JSON as labeled monospace text since it is this app's own generated data, not provider prose.

## Configuration

TODO(exports): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(exports): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(exports): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(exports): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(exports): link the related features, the prerequisites, and the natural next article a reader should open.
