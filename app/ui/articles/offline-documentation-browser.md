# Offline Documentation Browser

## Behaviour

The Docs screen (`/docs`, `app/ui/app/src/screens/docs/DocsBrowser.tsx` + `DocsDrawer.tsx` + `ArticlePane.tsx`) is real and is, fittingly, the very screen a user would open to read this article. `app/ui/docs.go`'s `loadDocsArticles` reads every bundled Markdown file under this same `docs/features/uh-completeness/articles/` directory at request time and serves it through `GET /api/v1/docs/inventory` (the full 85-feature list) and a per-article endpoint; the drawer groups all 85 features alphabetically, shows a live match count as the user types in its "Search 85 features..." field, and `ArticlePane.tsx` renders "Not written" for any feature whose article body is still template TODOs, and the real body otherwise.

That "Not written" label is not a guess -- `app/ui/docs.go`'s `docsIsScaffoldOnly` walks every non-blank, non-heading line of an article and returns true only if every one of them still matches the TODO placeholder pattern. The `docs.png` capture used elsewhere in this inventory shows exactly that state, captured before this evidence pass wrote real Behaviour prose for the rows in it; because this pass has since replaced this article's own TODO Behaviour section (and several others') with real content, a fresh build of the app would now report this article's status differently the next time `docsIsScaffoldOnly` runs against it. Nothing about the selected article or the search query is persisted across a reload -- there is no localStorage or backend "last viewed" endpoint. The drawer's own search (`filterFeatures` in `./groupFeatures.ts`) matches plain-text case-insensitively against both `title` and `id`, or a case-insensitive regular expression in regex mode, and treats an invalid pattern as zero matches rather than throwing -- the same non-crashing contract every other regex-mode search bar in this app follows.

## Test coverage

`DocsDrawer.dom.test.tsx` renders the drawer with a small fixture list and asserts: each feature shows the real "Written"/"Not written" badge rather than a placeholder; typing into the search field narrows the list to the matching title and updates the live "N of 85 features" count text; and a query nothing matches shows the real "No features match this search." empty state rather than a silently empty list. No dedicated test yet covers `docs.go`'s `loadDocsArticles`/`docsIsScaffoldOnly` or `ArticlePane.tsx`.

## Configuration

TODO(offline-documentation-browser): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(offline-documentation-browser): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(offline-documentation-browser): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

- Focused test: `app/ui/app/src/screens/docs/DocsDrawer.dom.test.tsx::filters the list to matches of the typed query and updates the match count` (plus its two sibling cases in the same file).
- Built-artifact proof: `docs/features/uh-completeness/captures/manifest.json#captures.6.artifact.sha256`.
- Capture evidence: `docs/features/uh-completeness/captures/images/docs.png`, showing the real "83 of 85 features" count and the A-Z grouped, "Not written"-badged drawer.

## Suggested articles

TODO(offline-documentation-browser): link the related features, the prerequisites, and the natural next article a reader should open.
