#!/usr/bin/env python3
"""Compose the side-by-side and the visual diff for one design-parity row.

Reads the reference and built captures for a row, writes three artefacts and
prints one JSON record on stdout:

  side-by-side/<id>.png   the two frames labelled and set beside each other
  diff/<id>.png           a per-pixel difference heat image
  (stdout)                the machine-readable diff record

Deliberately dependency-light: Pillow only, which the capture lane already
requires, and no font file -- the labels use Pillow's built-in bitmap font so
this cannot fail on a machine that happens not to have a TrueType face.

No threshold in here decides anything. The numbers describe the difference;
whether a row passes is a judgement made against the fifteen-point Material
Design 3 audit, by someone who looked at the pictures. A script that declared
parity below some pixel percentage would be asserting the one thing it cannot
know.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

LABEL_HEIGHT = 24
GUTTER = 8
GRID_COLS = 12
GRID_ROWS = 9


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_rgb(path: Path) -> Image.Image:
    with Image.open(path) as image:
        return image.convert("RGB")


def compose_side_by_side(reference: Image.Image, built: Image.Image, row_id: str, out: Path) -> None:
    width = reference.width + GUTTER + built.width
    height = LABEL_HEIGHT + max(reference.height, built.height)
    canvas = Image.new("RGB", (width, height), (245, 245, 245))
    canvas.paste(reference, (0, LABEL_HEIGHT))
    canvas.paste(built, (reference.width + GUTTER, LABEL_HEIGHT))

    draw = ImageDraw.Draw(canvas)
    draw.text((6, 7), f"reference - {row_id}", fill=(20, 20, 20))
    draw.text((reference.width + GUTTER + 6, 7), f"built - {row_id}", fill=(20, 20, 20))
    # A hairline between the two frames, so a reader can always tell where one
    # ends even when the two are nearly identical.
    draw.rectangle(
        [reference.width, LABEL_HEIGHT, reference.width + GUTTER - 1, height - 1],
        fill=(200, 200, 200),
    )
    canvas.save(out)


def compose_diff(reference: Image.Image, built: Image.Image, out: Path) -> dict:
    difference = ImageChops.difference(reference, built)
    # Amplify so a small but real difference is visible to a human rather than
    # a near-black rectangle that reads as "no difference".
    heat = difference.point(lambda v: min(255, v * 4))
    heat.save(out)

    width, height = reference.size
    total = width * height
    pixels = difference.load()

    differing = 0
    max_delta = 0
    delta_sum = 0
    buckets = {"0": 0, "1-4": 0, "5-16": 0, "17-64": 0, "65-255": 0}
    cell_w = max(1, width // GRID_COLS)
    cell_h = max(1, height // GRID_ROWS)
    grid = [[0 for _ in range(GRID_COLS)] for _ in range(GRID_ROWS)]

    for y in range(height):
        for x in range(width):
            r, g, b = pixels[x, y]
            delta = max(r, g, b)
            delta_sum += delta
            if delta > max_delta:
                max_delta = delta
            if delta == 0:
                buckets["0"] += 1
                continue
            differing += 1
            if delta <= 4:
                buckets["1-4"] += 1
            elif delta <= 16:
                buckets["5-16"] += 1
            elif delta <= 64:
                buckets["17-64"] += 1
            else:
                buckets["65-255"] += 1
            row = min(GRID_ROWS - 1, y // cell_h)
            col = min(GRID_COLS - 1, x // cell_w)
            grid[row][col] += 1

    cell_total = cell_w * cell_h
    grid_ratios = [[round(cell / cell_total, 4) for cell in row] for row in grid]

    return {
        "width": width,
        "height": height,
        "pixelTotal": total,
        "differingPixels": differing,
        "differingRatio": round(differing / total, 6),
        "maxChannelDelta": max_delta,
        "meanChannelDelta": round(delta_sum / total, 4),
        "deltaBuckets": buckets,
        "gridRows": GRID_ROWS,
        "gridCols": GRID_COLS,
        "gridDifferingRatios": grid_ratios,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--id", required=True)
    parser.add_argument("--reference", required=True)
    parser.add_argument("--built", required=True)
    parser.add_argument("--side-by-side", required=True)
    parser.add_argument("--diff-image", required=True)
    parser.add_argument("--tuple-json", required=True)
    args = parser.parse_args()

    reference_path = Path(args.reference)
    built_path = Path(args.built)
    reference = load_rgb(reference_path)
    built = load_rgb(built_path)

    if reference.size != built.size:
        print(
            json.dumps(
                {
                    "error": (
                        f"size mismatch: reference {reference.size} vs built {built.size}. "
                        "Both sides must be captured at the comparison tuple, or the diff "
                        "describes two different frames."
                    )
                }
            )
        )
        return 1

    side_by_side = Path(args.side_by_side)
    diff_image = Path(args.diff_image)
    side_by_side.parent.mkdir(parents=True, exist_ok=True)
    diff_image.parent.mkdir(parents=True, exist_ok=True)

    compose_side_by_side(reference, built, args.id, side_by_side)
    metrics = compose_diff(reference, built, diff_image)

    record = {
        "schemaVersion": 1,
        "rowId": args.id,
        "tuple": json.loads(args.tuple_json),
        "referencePath": args.reference,
        "referenceSha256": sha256(reference_path),
        "builtPath": args.built,
        "builtSha256": sha256(built_path),
        "sideBySidePath": args.side_by_side,
        "sideBySideSha256": sha256(side_by_side),
        "diffImagePath": args.diff_image,
        "diffImageSha256": sha256(diff_image),
        "generator": "scripts/parity/compare_images.py",
        "python": sys.version.split()[0],
        **metrics,
    }
    print(json.dumps(record))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
