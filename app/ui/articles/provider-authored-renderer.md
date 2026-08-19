# Provider Authored Renderer

## Behaviour

This app renders provider- and user-authored Markdown through one shared component, `components/StreamingMarkdownContent.tsx`, built on the third-party `Streamdown` renderer -- never printed as raw source text. Two safety properties are enforced and directly tested rather than merely assumed: `StreamingMarkdownContent.test.tsx`'s "does not enable raw HTML parsing" proves the renderer's `rehypePlugins` explicitly excludes the `raw` plugin (so embedded HTML like `<iframe>` cannot execute), and "does not render markdown image src values" proves a markdown image whose `src` would leak data to a third-party URL is not rendered as a live network request. This is the isolated-renderer discipline the canonical contract requires: content authored elsewhere is rendered through one shared, sandboxed pipeline rather than being handed the app's own privileges.

The exports feature (`exports.md`) reuses this exact same renderer for its own generated Markdown -- `ExportPreview.tsx`'s own doc comment states it directly ("Streamdown, this app's one shared markdown renderer, already used for chat") -- rather than building a second one, so the isolation and plugin allowlist cannot drift between the chat surface and the exports surface. HTML content specifically renders through a fully sandboxed `<iframe>` (no scripts, no same-origin) rather than through the Markdown pipeline at all, so it never runs with this app's own privileges regardless of what the HTML contains. Formats that are this app's own generated data rather than provider-authored prose (JSON, JSONL, YAML, CSV, TSV) deliberately render as labeled monospace text instead -- there is no "rendered form" of a CSV row to render, and treating it as if there were would be dishonest about what it is.

## Configuration

TODO(provider-authored-renderer): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(provider-authored-renderer): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(provider-authored-renderer): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(provider-authored-renderer): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(provider-authored-renderer): link the related features, the prerequisites, and the natural next article a reader should open.
