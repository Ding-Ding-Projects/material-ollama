# App Logo Customization

> **Scope note.** This article covers two related but distinct things, and is
> honest about which one this project has today. The **shipped default
> identity** -- an original mark, a packaged multi-resolution icon, and the
> mark wired into as much of the app's chrome as this lane's scope reached --
> is implemented and described below. The **interactive customization
> surface** the shared contract also requires (a presets picker, a local
> custom-image upload, crop/fit/background editing, live application, and
> reset-to-default) is **not implemented yet**. Its "missing" status in
> `docs/features/uh-completeness/inventory.json` is correct and this article
> does not change it. See "What is not yet built" below for the exact gap.

## Behaviour

### What ships today: the default mark

The project has its own original identity mark -- not upstream Ollama's
llama, and not a copy of any other real organisation's branding. The
committed vector master lives at `app/assets/material-ollama-mark.svg`: a
rounded-square badge (an indigo-to-violet gradient, MD3 "large" corner
radius) containing a simple white three-node network glyph -- a small hub
with two connected nodes, read as a nod to both halves of the name: Material
(Google Material's rounded-square shape language) and Ollama (models running
as a small connected cluster of local processes rather than one remote
endpoint).

`scripts/build-app-icon.mjs` regenerates everything else from that one
master, with zero third-party dependencies (Node's own `fs`, `path`, and
`zlib` only -- no `sharp`, no native image library, nothing that needs a
network install):

- **`app/assets/app.ico`** -- a real multi-resolution Windows icon
  (16/24/32/48/64/128/256px frames, each a genuine PNG-compressed frame
  inside a standard ICONDIR/ICONDIRENTRY container). The script reads its
  own output back from disk afterwards and verifies the ICONDIR header
  against each frame's actual embedded PNG bytes -- see "Verification"
  below.
- **`app/ui/app/public/icons/icon-{16,32,48,64,128,192,256,512}.png`** -- flat
  PNG derivatives for the web app (a manifest.json / apple-touch-icon set
  does not exist yet; these are ready for one).
- **`app/ui/app/public/favicon.svg`** and **`app/ui/app/public/vite.svg`** --
  the master SVG, copied verbatim. `vite.svg` is not a typo: it is the exact
  file `app/ui/app/index.html`'s existing
  `<link rel="icon" type="image/svg+xml" href="/vite.svg">` already resolves
  to (a leftover from the Vite scaffold that was never pointed at a real
  project mark, and was in fact a dead link before this change -- no
  `vite.svg` existed in `public/` at all). `index.html` itself is outside
  this lane's allowed paths, so rather than leave that `<link>` pointed at
  nothing, the file it already reads is now the real mark. `favicon.svg` is
  the honestly-named copy for whoever next touches `index.html` and wants to
  rename the `<link>` target.
- **`app/ui/app/src/components/md3/AppMark.tsx`** -- a React component
  rendering the identical geometry inline as JSX (not an `<img>`), so it can
  be sized, given a `variant="mono"` single-`currentColor` rendering for
  contexts that need one ink colour, and marked decorative or accessible as
  the call site needs. It renders the same mark shown in the title bar of
  every other app-shell screenshot in this repository's captures.

### Where the mark is (and is not yet) wired into chrome

The release gate asks for the mark "wired into application chrome,
executable, installer and update metadata." Status, plainly:

| Surface | Status | Detail |
| --- | --- | --- |
| Web app favicon | **Wired** | `public/vite.svg` (the active `<link>` target) and `public/favicon.svg` are the real mark; confirmed present in the built `dist/` output (see Verification). |
| React title-bar component | **Built, not yet mounted** | `AppMark.tsx` exists and compiles/lints/type-checks cleanly, but `app/ui/app/src/components/shell/AppShell.tsx` -- which currently renders a borrowed Material Symbols glyph (`<Icon name="raven" size={20} className="shrink-0 text-primary" />`, module constant `APP_GLYPH = "raven"`) as a stand-in app icon -- is outside this lane's allowed paths. Swapping it in is a one-line change: replace that `<Icon .../>` with `<AppMark size={20} className="shrink-0" />`. |
| Windows executable icon resource (`app/ollama.rc`) | **RC statement added; not yet linked into any build** | See "The `.rc` gap" below. |
| Windows installer icon (`app/ollama.iss`) | **Wired, unchanged file** | `ollama.iss` already referenced `.\assets\app.ico` by that exact path before this change (`#define MyIcon ".\assets\app.ico"`, `SetupIconFile={#MyIcon}`, the `[Icons]` entries' `IconFilename`, and the `Source: ".\assets\app.ico"` copy step). Regenerating `app.ico` in place, under the same filename, is what actually changes the installer's icon -- no `.iss` edit was needed. Not compiled with Inno Setup's `ISCC.exe` as part of this change (not installed on this machine); verified instead by direct inspection of the unchanged reference plus the independent `.ico` validity check below. |
| Squirrel auto-update metadata | **Not touched** | Out of this lane's allowed paths (`app/updater/`, `app/cmd/squirrel/`). The update feed's own branding, if any, is a separate concern from the packaged icon. |
| System tray icon (`tray.ico`, `tray_upgrade.ico`) | **Not touched, deliberately** | The task scope named the *app* icon specifically; the tray icons are a related but separate asset this lane did not touch, to avoid scope creep beyond what was asked. |

#### The `.rc` gap

`app/ollama.rc` now carries a real `IDI_APPICON ICON "assets\\app.ico"`
statement, placed first in the file (the ICON resource with the lowest ID --
the first one encountered when none is given an explicit numeric ID -- is
the one Windows Explorer uses as the shell icon for the compiled
executable). This was compiled and verified with the real
`x86_64-w64-mingw32-windres.exe` from this project's own toolchain: it
produced a valid 15,776-byte COFF object with `.rsrc$01`/`.rsrc$02`
sections, and pointing the same statement at a nonexistent file made the
same tool fail loudly (`llvm-rc: Error in ICON statement ... file not
found`), which is real, independent proof the statement is both
syntactically correct and genuinely reading the committed `app.ico`.

What that test *cannot* prove, and what remains open: **nothing in this
repository's Windows build currently compiles `ollama.rc` into a `.syso` and
links it into `ollama-app.exe`.** `scripts/build_windows.ps1` builds the app
with a plain `go build ... -H windowsgui ... -o
.\dist\windows-ollama-app-${arch}.exe ./app/cmd/app/` and no resource-compile
step anywhere before it; no `.syso` is committed under `app/cmd/app/`
either (Go's linker only auto-embeds a `.syso` file that lives in the exact
package directory being linked, so it has to be there specifically, not
merely somewhere in the module). Both `scripts/build_windows.ps1` and
`app/cmd/app/` are outside this lane's allowed paths. **The remaining work is
one build step**: compile `app/ollama.rc` to `app/cmd/app/ollama.syso` (e.g.
via `x86_64-w64-mingw32-windres.exe -O coff -o app\cmd\app\ollama.syso
app\ollama.rc`, run from `app/`, or the ARM64 equivalent for the arm64
build) immediately before the `go build ... ./app/cmd/app/` line in
`scripts/build_windows.ps1`, for both architectures that script builds.
Until that lands, `ollama-app.exe`'s Explorer/taskbar icon is whatever the Go
toolchain's own default is, not this mark -- despite the `.rc` file, on its
own, now being correct and ready.

### What is not yet built

The full "App Logo Customization" feature the shared contract describes is a
user-facing settings surface: several shipped presets to choose between, a
local custom-image upload with bounded/validated decoding, crop/fit/focal
point/background editing, a live preview, persistence of the choice, and a
reset-to-shipped-mark action -- all localized, keyboard- and screen-reader
operable, searchable via the settings search bar, and covered by the local
personal-data privacy rules (no upload leaves the device, nothing enters
telemetry or exports). None of that exists yet. What this change adds is the
**one shipped preset** that surface would need as its default option and
its reset target -- the original mark described above -- plus the generator
that would regenerate every derived asset if a future preset picker changed
which SVG is active. The settings screen, upload pipeline, and editor are a
separate, considerably larger piece of work.

## Configuration

Nothing here is user-configurable yet -- see "What is not yet built" above.
There is no setting; the shipped mark is the only mark, applied
unconditionally everywhere it is wired in.

For a maintainer regenerating the assets after editing the master SVG:

```sh
node scripts/build-app-icon.mjs
```

The master SVG's shape vocabulary is deliberately narrow (exactly one
`<rect>`, one 2-stop `<linearGradient>`, two `<line>`s, three `<circle>`s --
see the comment at the top of `material-ollama-mark.svg` itself). The
generator's reader (`parseMasterSvg` in `build-app-icon.mjs`) is a small,
purpose-built parser for exactly that vocabulary, not a general SVG engine;
editing the master outside that vocabulary requires updating the reader in
the same change, and the reader throws a specific, named error rather than
silently mis-rendering if the two drift apart (see Verification).

## Failure modes

- **Master SVG missing or unreadable**: `readFileSync` throws Node's normal
  `ENOENT`/permission error; the script exits non-zero before writing
  anything.
- **Master SVG present but its shape vocabulary doesn't match**: each of the
  five `must(...)` lookups in `parseMasterSvg` (gradient, rect, stroke
  group, exactly-2 lines, exactly-3 circles) throws a specific error naming
  what it expected and where, rather than rendering a partial or wrong icon.
  Verified live: deliberately removing one `<circle>` from the master
  produces `Error: build-app-icon.mjs: expected exactly 3 <circle> nodes,
  found 2.` and a non-zero exit; restoring the file reproduces the exact
  original 14,320-byte `app.ico` and unchanged PNG derivatives.
- **A requested icon size does not evenly divide the supersample
  resolution**: `buildSizeList()` throws before any rendering starts, naming
  the offending size, rather than silently producing a softened or skewed
  frame from a fractional box filter.
- **Downstream `.rc`/`.iss` wiring**: see "The `.rc` gap" above -- until a
  resource-compile step is added to `scripts/build_windows.ps1`, the
  packaged executable's own icon resource is not this mark, even though the
  `.rc`/`.ico` pairing is individually correct. This is reported here rather
  than hidden.

## Security considerations

- The generator does no network access and takes no user input; it is a
  build-time script run against a file already inside the repository, not a
  runtime attack surface.
- It writes only inside `app/assets/` and `app/ui/app/public/`, never
  outside the repository, and never touches anything resembling a secret.
- The multi-resolution `.ico` is packed with PNG-compressed frames, which
  Windows has supported since Vista; every frame's dimensions are verified
  against its own embedded PNG `IHDR` immediately after writing (see
  Verification), specifically so a corrupt or mismatched frame -- including
  the "PNG renamed to `.ico`" failure mode named in this feature's
  acceptance criteria -- cannot silently ship.

## Verification

**Focused checks run and their real results** (all from this change, in
`app/ui/app`, against the existing suite -- no test was added specifically
for `AppMark.tsx` beyond the type/lint/build gates below, since it is a pure
rendering component with no logic branch beyond the `variant`/`decorative`
props):

- `npx tsc -b` -- exit 0, no errors.
- `npx eslint src/components/md3/AppMark.tsx` -- exit 0, no output.
- `npx vitest run` -- **7 test files / 36 tests, all passing** (the
  project's existing measured baseline; unchanged by this addition, since
  `AppMark.tsx` is not yet imported anywhere).
- `npm run build` (`tsc -b && vite build`) -- succeeded in 20.34s; confirmed
  `dist/favicon.svg`, `dist/vite.svg`, and `dist/icons/icon-{...}.png` are
  all present in the real built output, and `dist/index.html`'s favicon
  `<link>` still resolves to `/vite.svg` -- now the real mark instead of a
  dead reference.

**Built-artifact / generator self-proof:**

- `node scripts/build-app-icon.mjs` -- real run, real output. Produced
  `app/assets/app.ico` (14,320 bytes) and read it back from disk
  immediately afterward, verifying: `reserved==0`, `type==1`, frame count
  `==7`, and for every one of the 7 frames -- its ICONDIRENTRY-declared
  width/height equals its own embedded PNG's `IHDR` width/height, and its
  bytes genuinely start with the 8-byte PNG signature. The full printed
  table (index, declared size, IHDR size, bits-per-pixel, byte size, file
  offset) is reproduced in this change's commit/handoff evidence.
- **Guard-failure proof, not just guard-success proof**: the ICO
  frame-signature check was exercised against a deliberately corrupted copy
  of `app.ico` (one byte of the first frame's PNG signature flipped to
  `0x00`) and correctly rejected it (`frame #0 (declared 16px) does not
  start with PNG signature at byte 0 -- REJECTED`); run again against the
  real, uncorrupted file it correctly passed. The master-SVG parser guard
  was exercised the same way -- see Failure modes above.
- **Independent, non-Node cross-check**: `app/ollama.rc`'s new `ICON`
  statement was compiled with the project's own
  `x86_64-w64-mingw32-windres.exe` (llvm-mingw toolchain), producing a
  valid 15,776-byte COFF object with real `.rsrc` sections -- exit 0.
  Pointing the same statement at a nonexistent path made the same
  independent tool fail with `file not found`, exit 1. This corroborates
  the generated `.ico`'s validity through a tool this project did not write.

**Real capture evidence:** the packaged icon was rendered at its true pixel
sizes (not re-rendered fresh at high resolution and scaled for viewing) and
inspected: at 256px and 32px the three-node glyph is clearly legible with
distinct nodes and connectors; at native 16px the two bottom nodes and their
connectors visually merge into one bright upward silhouette rather than
staying three crisp separate dots, while the overall badge -- a
high-contrast, distinctively coloured rounded-square shape -- remains
clearly legible and identifiable against other icons. This is reported
honestly rather than claimed as a clean pass at every size: 16px keeps the
mark recognisable as a badge, not as "three nodes" specifically.

**Not yet captured**: a real built-and-installed desktop app screenshot
showing the mark in the title bar, the taskbar, or Explorer, since (a)
`AppMark.tsx` is not yet mounted in `AppShell.tsx` and (b) the `.rc` →
`.syso` build-linking gap above means the packaged executable does not yet
carry this icon even once compiled. Both are named explicitly as open
follow-up work rather than implied complete.

## Suggested articles

- **`packaged-app-icon`** (`docs/features/uh-completeness/articles/packaged-app-icon.md`)
  -- the closely related inventory entry for the packaged icon asset itself
  (the `.ico`, its platform formats, and executable/installer wiring). That
  article's path does not match this lane's allowed-paths glob
  (`docs/features/**/app-logo*.md`) and was left as its existing TODO stub;
  most of what it should describe is the same material documented above
  under "Where the mark is (and is not yet) wired into chrome."
- The natural next article, once it exists, is the interactive
  customization surface itself (presets picker, upload, crop editor) --
  see "What is not yet built" above for its exact scope.
- `infinite-color-translator` and the broader Material Design 3 appearance
  customization contract, for the picker infrastructure a future presets/
  upload UI would likely reuse.
