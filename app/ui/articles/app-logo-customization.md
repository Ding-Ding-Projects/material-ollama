# App Logo Customization

## Behaviour

`AppearanceCard.tsx` renders a fixed picker of nine glyph presets (`GLYPH_OPTIONS`: none, plus `raven`/`robot_2`/`smart_toy`/`bolt`/`rocket_launch`/`neurology`/`deployed_code`/`memory`, all existing Material Symbols already bundled by `Icon.tsx`), each selectable as `preferences.appearance.glyph` via `applyGlyph`, which PATCHes `/api/v1/uh/preferences`. This is a real, working preset picker -- but it is presets only: there is no local custom-image upload control anywhere in the codebase, so the canonical contract's "several shipped, project-appropriate logo presets **plus** a local custom-image upload" is only half built, and none of the crop/fit/background/safe-area editing the fuller contract describes exists either.

As with `app-display-name.md`, the write half is real and the read half is not yet wired to anything: `preferences.appearance.glyph` is referenced only inside `AppearanceCard.tsx` and `types.ts`. The app's actual title bar and packaged icon are unaffected by this preference -- `AppShell.tsx` renders the fixed `AppMark` brand SVG (not a glyph chosen here), and the packaged `.ico`/favicons are generated once at build time from `app/assets/material-ollama-mark.svg` (see `scripts/build-app-icon.mjs`), with no runtime read of this stored preference at all. So today a chosen glyph persists durably but changes nothing outside the Settings screen itself -- the card's own "Preview" row (the small surface directly below the glyph grid) does update live to the newly selected icon and the `previewName`, which is real and immediate feedback, but it is the only surface in the app that reflects the choice.

## Test coverage

`AppearanceCard.dom.test.tsx` clicks a non-default glyph option ("rocket_launch") and asserts three things change together, atomically, in the same render: the clicked button's own `aria-pressed` becomes `"true"`; the previously-selected "Brand mark" button's `aria-pressed` becomes `"false"` (proving selection is exclusive, not additive); and the provenance line updates to "Currently your saved value: rocket_launch". No test covers the title bar, packaged icon, or any surface outside the Settings screen, because -- as this article says above -- none of them read this preference yet.

## Configuration

TODO(app-logo-customization): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(app-logo-customization): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(app-logo-customization): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

- Focused test: `app/ui/app/src/screens/Settings/AppearanceCard.dom.test.tsx::selecting a glyph marks it pressed and updates the live preview icon`.
- Built-artifact proof: deliberately not attached, for the same reason as `app-display-name.md` -- the glyph grid sits below the fold in `settings.png`, which shows only the General card.
- Capture evidence: not yet attached, for the same reason. Recapturing `/settings` scrolled to the Appearance card's glyph picker and Preview row would close this gap honestly.

## Suggested articles

TODO(app-logo-customization): link the related features, the prerequisites, and the natural next article a reader should open.
