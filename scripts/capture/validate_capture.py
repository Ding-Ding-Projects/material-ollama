#!/usr/bin/env python
"""validate_capture.py -- blankness/sanity check for one capture PNG.

WebView2 composites out of process, so a PrintWindow-based capture
(cheap-route screenshot(hwnd=...)) can return "ok": true, "rendered_ok":
true and still be a solid white or transparent rectangle -- the tool's own
claim is not evidence, per this repository's own hard-won notes on the
lowlevel-computer-use route. This script is the independent check: it
opens the PNG with Pillow and reads real pixels, so a successful capture
of nothing is caught here rather than trusted.

Three checks, all must pass for "ok": true:
  1. distinct_colors  >= --min-distinct-colors (default 256)
  2. max channel stddev across R/G/B >= --min-stddev (default 6.0)
  3. actual (width, height) == (--expected-width, --expected-height), when given

Usage:
  python validate_capture.py --path shot.png [--expected-width 816] [--expected-height 639]

Prints one JSON object to stdout and exits 0 when ok, 1 otherwise (so a
caller can branch on exit code without re-parsing JSON if it wants to).
"""

import argparse
import json
import sys


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--path", required=True)
    parser.add_argument("--expected-width", type=int, default=None)
    parser.add_argument("--expected-height", type=int, default=None)
    parser.add_argument("--min-distinct-colors", type=int, default=256)
    parser.add_argument("--min-stddev", type=float, default=6.0)
    args = parser.parse_args()

    try:
        from PIL import Image, ImageStat
    except ImportError as exc:
        print(json.dumps({"ok": False, "reasons": [f"Pillow unavailable: {exc}"]}))
        return 1

    reasons = []
    try:
        with Image.open(args.path) as im:
            im = im.convert("RGB")
            width, height = im.size

            colors = im.getcolors(maxcolors=width * height + 1)
            distinct_colors = len(colors) if colors is not None else width * height + 1

            stat = ImageStat.Stat(im)
            stddev = stat.stddev  # [r, g, b]
            stddev_max = max(stddev)

            if distinct_colors < args.min_distinct_colors:
                reasons.append(
                    f"only {distinct_colors} distinct colors (need >= {args.min_distinct_colors}); "
                    "capture looks blank or near-uniform"
                )
            if stddev_max < args.min_stddev:
                reasons.append(
                    f"max per-channel stddev {stddev_max:.2f} (need >= {args.min_stddev}); "
                    "capture has almost no visual variation"
                )
            if args.expected_width is not None and width != args.expected_width:
                reasons.append(f"width {width} != expected {args.expected_width}")
            if args.expected_height is not None and height != args.expected_height:
                reasons.append(f"height {height} != expected {args.expected_height}")

            result = {
                "ok": len(reasons) == 0,
                "path": args.path,
                "width": width,
                "height": height,
                "distinctColors": distinct_colors,
                "stddevR": round(stddev[0], 3),
                "stddevG": round(stddev[1], 3),
                "stddevB": round(stddev[2], 3),
                "stddevMax": round(stddev_max, 3),
                "reasons": reasons,
            }
            print(json.dumps(result))
            return 0 if result["ok"] else 1
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"ok": False, "reasons": [f"{type(exc).__name__}: {exc}"]}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
