#!/usr/bin/env python3
"""Builds the Atlas Translation extension icons from the Atlas Commerce sunburst.

The sunburst is taken from the Atlas Commerce brand (public/atlas-icon-dark.png). A translation badge
(a paper-coloured disc with "A" and a two-way arrow) is added at the bottom right, so the icon reads as
a translation tool while keeping the Atlas look.

Usage: python3 scripts/make-atlas-translation-icons.py <source-dir> <output-dir>
  source-dir: folder that contains atlas-icon-dark.png (from Etherealmber/atlas-commerce public/)
Requires Pillow (pip install pillow) and DejaVu Sans Bold (Linux) or any Bold sans font.
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont

INK = (10, 10, 10, 255)          # Atlas accent #0a0a0a
PAPER = (255, 253, 249, 255)     # Atlas paper #fffdf9
FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
]


def load_font(size):
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def build(source_dir, size):
    sun = Image.open(os.path.join(source_dir, "atlas-icon-dark.png")).convert("RGBA")
    # Tile: rounded black square, like the Atlas app icon.
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=round(size * 0.22), fill=INK)

    # Sunburst in paper colour, upper left.
    sun_size = round(size * 0.66)
    sun_resized = sun.resize((sun_size, sun_size), Image.LANCZOS)
    sun_tinted = Image.new("RGBA", sun_resized.size, PAPER)
    sun_tinted.putalpha(sun_resized.getchannel("A"))
    offset = round(size * 0.12)
    canvas.alpha_composite(sun_tinted, (offset, offset))

    # Translation badge: paper disc with a black ring, bottom right.
    radius = round(size * 0.22)
    cx, cy = size - radius - round(size * 0.04), size - radius - round(size * 0.04)
    draw.ellipse([cx - radius - round(size * 0.02), cy - radius - round(size * 0.02),
                  cx + radius + round(size * 0.02), cy + radius + round(size * 0.02)], fill=INK)
    draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=PAPER)
    if size >= 32:
        font = load_font(max(8, round(size * 0.24)))
        draw.text((cx, cy), "A\u21c4", font=font, fill=INK, anchor="mm")
    else:
        # Too small for text at 16 px: draw two short arrows instead.
        w = max(1, round(size * 0.02))
        draw.line([cx - radius * 0.6, cy - radius * 0.2, cx + radius * 0.6, cy - radius * 0.2], fill=INK, width=w)
        draw.line([cx - radius * 0.6, cy + radius * 0.2, cx + radius * 0.6, cy + radius * 0.2], fill=INK, width=w)
    return canvas


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    source_dir, out_dir = sys.argv[1], sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    for size in (16, 32, 48, 64, 128):
        build(source_dir, size).save(os.path.join(out_dir, f"icon-{size}.png"), optimize=True)
        print("wrote", os.path.join(out_dir, f"icon-{size}.png"))


if __name__ == "__main__":
    main()
