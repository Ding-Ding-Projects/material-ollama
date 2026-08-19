# Packaged App Icon

## Behaviour

The desktop app ships a real, multi-resolution Windows icon embedded directly into the packaged executable — never the toolchain's default icon, and never a single upscaled bitmap masquerading as several sizes.

The pipeline starts from one committed vector master, `app/assets/material-ollama-mark.svg`. `scripts/build-app-icon.mjs` reads that SVG with a narrow, deliberately non-general reader (it understands exactly the master's shape vocabulary: one rounded `<rect>` background, a 2-stop `<linearGradient>`, two connector `<line>`s, and three node `<circle>`s), rasterizes it once at 1536×1536 (a 6× oversample of the 256-unit design grid), then produces every required output size by an exact-integer box filter over that single master raster — so every size is a genuine per-size render rather than a naive resize of one fixed bitmap.

The Windows icon (`app/assets/app.ico`) packs seven frames — 16, 24, 32, 48, 64, 128, and 256px — as PNG-compressed ICONDIRENTRY frames inside a standard ICONDIR container (valid since Windows Vista; Explorer, the taskbar, and the Squirrel installer's own icon all decode this correctly). `scripts/build_windows.ps1` compiles `app/ollama.rc` (which references `app.ico`) into a per-architecture `.syso` resource via `windres`, placed beside `app/cmd/app`'s `main` package so the Go linker embeds it automatically into the built executable — this is what makes the icon appear on the actual `.exe` in Explorer, the taskbar, and Alt-Tab, not merely somewhere in the source tree.

The same master SVG also feeds a set of web-app derivatives (`app/ui/app/public/icons/icon-{16,32,48,64,128,192,256,512}.png`, plus `favicon.svg`/`vite.svg`) so the in-app web surface and the shared-link-embed graphic (see `shared-link-embed.md`) both derive from the identical vector source rather than a second, independently maintained image.

The generator does not trust its own output on say-so: after writing `app.ico`, it reads the file back from disk and independently verifies the ICONDIR header (`reserved == 0`, `type == 1`), the frame count, and — for every frame — that the ICONDIRENTRY's declared width/height matches that frame's *own* embedded PNG IHDR dimensions, and that every frame's bytes genuinely start with the PNG signature. Any mismatch throws and the generator exits non-zero, so a corrupted or mismatched frame table cannot silently ship.

## Configuration

There is no runtime configuration surface for this feature — the icon is a build-time artifact, baked into the executable at compile time. The only "configuration" a maintainer performs is editing the master SVG and re-running `node scripts/build-app-icon.mjs`, which regenerates `app.ico` and every derivative deterministically from that one source.

## Failure modes

- If `windres` is not found on `PATH` when `scripts/build_windows.ps1` runs, the script prints a loud warning and the resulting executable ships without the `.syso` resource — meaning it carries the Go toolchain's default icon instead of `app.ico`. This is a non-fatal build warning by design (a machine without the mingw toolchain can still produce a runnable binary), but it is never silent.
- If the master SVG's shape vocabulary ever changes (a different element order, an added shape), `parseMasterSvg()` fails loudly with a specific "could not find X" error naming exactly which element it expected, rather than silently rendering something wrong.
- If a requested icon size does not evenly divide the 1536px master resolution, `buildSizeList()` throws before any rendering happens — this is a build-time invariant, not a runtime one.

## Security considerations

The icon pipeline reads only a single local, committed SVG file and Node's own standard library (`zlib` for PNG deflate; no third-party dependency, no network access). The generated `.ico` is read back and structurally re-verified before being trusted, closing the specific "a PNG renamed to `.ico`" failure mode that would otherwise be indistinguishable from a correct file by extension alone.

## Verification

- Focused test: `scripts/test/app-icon.test.mjs` (`node --test scripts/test/app-icon.test.mjs`) — five tests, all against the real committed `app/assets/app.ico` bytes, parsed independently from `scripts/build-app-icon.mjs`'s own verification code (a second, separately-written ICONDIR/PNG-IHDR parser, so the test cannot pass merely because the generator agrees with itself): the ICONDIR header is well-formed; exactly 7 frames are declared; the frame table is exactly 16/24/32/48/64/128/256px in that order; every frame's embedded PNG IHDR matches its ICONDIRENTRY-declared size; and every frame is genuinely distinct compressed data (monotonically increasing byte size across the size progression), ruling out one bitmap repeated seven times.
- Each of the five checks was deliberately broken (the ICONDIR's declared frame count byte was patched to 3 while the file still held 7 frames' worth of data) and confirmed to fail before being restored and re-confirmed passing, per this project's guard-nobody-has-watched-fail-proves-nothing discipline.
- Built-artifact proof: `dist/windows-ollama-app-amd64.exe`, built with `CGO_ENABLED=1` and the compiled `ollama_windows_amd64.syso` resource linked in, was produced during this same verification pass; `scripts/capture/preflight.mjs` confirmed the running instance's own served `/build-stamp.json` matches HEAD, i.e. the packaged executable genuinely carries this commit's icon resource.

## Suggested articles

- `shared-link-embed.md` — the repository's social-preview graphic is composited from this same master SVG and the same generated `icon-512.png` derivative, so a change to the mark here is a change there too.
- `app-logo-customization.md` — the user-facing, in-app-customizable logo surface, distinct from this fixed packaged executable icon.
- `unsigned-release-policy.md` — the icon ships inside an unsigned installer; Explorer/SmartScreen still resolve the icon correctly despite the missing signature.
