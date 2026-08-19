# Offline Documentation Browser

## Behaviour

The Docs screen (`/docs`, `app/ui/app/src/screens/docs/DocsBrowser.tsx` + `DocsDrawer.tsx` + `ArticlePane.tsx`) is real and is, fittingly, the very screen a user would open to read this article. `app/ui/docs.go`'s `loadDocsArticles` reads every bundled Markdown file under this same `docs/features/uh-completeness/articles/` directory at request time and serves it through `GET /api/v1/docs/inventory` (the full 85-feature list) and a per-article endpoint; the drawer groups all 85 features alphabetically, shows a live match count as the user types in its "Search 85 features..." field, and `ArticlePane.tsx` renders "Not written" for any feature whose article body is still template TODOs, and the real body otherwise.

That "Not written" label is not a guess -- `app/ui/docs.go`'s `docsIsScaffoldOnly` walks every non-blank, non-heading line of an article and returns true only if every one of them still matches the TODO placeholder pattern. The `docs.png` capture used elsewhere in this inventory shows exactly that state, captured before this evidence pass wrote real Behaviour prose for the rows in it; because this pass has since replaced this article's own TODO Behaviour section (and several others') with real content, a fresh build of the app would now report this article's status differently the next time `docsIsScaffoldOnly` runs against it. Nothing about the selected article or the search query is persisted across a reload -- there is no localStorage or backend "last viewed" endpoint -- and no dedicated test covers the docs endpoints or the drawer/article-pane components yet.

## Configuration

TODO(offline-documentation-browser): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(offline-documentation-browser): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(offline-documentation-browser): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(offline-documentation-browser): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(offline-documentation-browser): link the related features, the prerequisites, and the natural next article a reader should open.
