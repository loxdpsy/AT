#!/usr/bin/env python3
"""Builds the Atlas Translation extension icons from the Atlas Commerce sunburst.

Design: an Atlas black tile with the paper-coloured sunburst from Atlas Commerce (public/atlas-icon-dark.png),
and a translation marker in the bottom-right corner: a paper disc with a black ring and two opposite arrows
(the universal "translate" sign). Shapes are drawn at 4x and downscaled, so the edges stay clean at 16 px.

Usage: python3 scripts/make-atlas-translation-icons.py <source-dir> <output-dir>
  source-dir: folder that contains atlas-icon-dark.png (from Etherealmber/atlas-commerce public/)
Requires Pillow (pip install pillow).
"""
import os
import sys
from PIL import Image, ImageDraw

INK = (10, 10, 10, 255)        # Atlas accent #0a0a0a
PAPER = (255, 253, 249, 255)   # Atlas paper #fffdf9
SS = 4                         # supersampling factor


def arrow(draw, x0, x1, y, head, width, color):
    """Horizontal arrow from x0 to x1 at height y. head > 0 points right, head < 0 points left."""
    draw.line([(x0, y), (x1, y)], fill=color, width=width)
    tip = x1
    base = x1 - head * 0.9
    h = width * 1.6
    width = round(width)
    draw.polygon([(tip, y), (base, y - h), (base, y + h)], fill=color)


def build(source_dir, size):
    big = size * SS
    sun = Image.open(os.path.join(source_dir, "atlas-icon-dark.png")).convert("RGBA")
    canvas = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)

    # 1. Tile: rounded black square.
    draw.rounded_rectangle([0, 0, big - 1, big - 1], radius=round(big * 0.22), fill=INK)

    # 2. Sunburst in paper colour, centred in the upper part of the tile.
    sun_px = round(big * 0.56)
    s = sun.resize((sun_px, sun_px), Image.LANCZOS)
    tinted = Image.new("RGBA", (sun_px, sun_px), PAPER)
    tinted.putalpha(s.getchannel("A"))
    canvas.alpha_composite(tinted, (round(big * 0.12), round(big * 0.08)))

    # 3. Translation marker: paper disc with black ring, bottom right.
    r = big * 0.21
    cx = cy = big * 0.745
    ring = big * 0.035
    draw.ellipse([cx - r - ring, cy - r - ring, cx + r + ring, cy + r + ring], fill=INK)
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=PAPER)
    # Two opposite arrows inside the disc: right arrow on top, left arrow below.
    w = max(1, round(big * 0.038))
    arrow(draw, cx - r * 0.62, cx + r * 0.52, cy - r * 0.28, head=r * 0.5, width=w, color=INK)
    arrow(draw, cx + r * 0.62, cx - r * 0.52, cy + r * 0.28, head=-r * 0.5, width=w, color=INK)

    return canvas.resize((size, size), Image.LANCZOS)


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    source_dir, out_dir = sys.argv[1], sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    for size in (16, 32, 48, 64, 128):
        path = os.path.join(out_dir, f"icon-{size}.png")
        build(source_dir, size).save(path, optimize=True)
        print("wrote", path)


if __name__ == "__main__":
    main()
