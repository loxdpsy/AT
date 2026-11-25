#!/usr/bin/env python3
"""Builds the Atlas Translation icons from the Atlas Commerce sunburst.

Two states, one design:
  - neutral (page in its original language): a graphite tile with a soft top light.
  - translated (the page is translated): the Atlas blue tile. The toolbar and the popup header use it.

Each tile has the paper-coloured sunburst, and a translate mark in the bottom-right corner: a white disc
with a soft shadow and two opposite arrows (the universal "translate" sign). Everything is drawn at 4x and
downscaled, so the edges stay clean at small sizes.

Usage: python3 scripts/make-atlas-translation-icons.py <source-dir> <output-dir>
  source-dir: folder that contains atlas-icon-dark.png (branding/atlas-source/)
  output-dir: folder for the icons (icons/). Writes icon-<size>.png and icon-<size>-translated.png.
Requires Pillow (pip install pillow).
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFilter

SS = 4  # supersampling factor
SIZES = (16, 32, 48, 64, 128)

THEMES = {
    "neutral": {
        "top": (62, 67, 78), "bottom": (14, 15, 19),
        "sun": (255, 253, 249), "disc": ((255, 255, 255), (226, 230, 238)), "ink": (16, 17, 21),
    },
    "translated": {
        "top": (72, 146, 255), "bottom": (18, 74, 196),
        "sun": (255, 255, 255), "disc": ((255, 255, 255), (222, 235, 255)), "ink": (18, 80, 210),
    },
}


def vertical_gradient(size, top, bottom):
    img = Image.new("RGBA", (size, size))
    draw = ImageDraw.Draw(img)
    for y in range(size):
        t = y / max(1, size - 1)
        color = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)) + (255,)
        draw.line([(0, y), (size, y)], fill=color)
    return img


def rounded_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def arrow(draw, x0, x1, y, head, width, color):
    """Horizontal arrow from x0 to x1 at height y, with round tail and a triangular head at x1."""
    r = width / 2
    direction = 1 if x1 > x0 else -1
    base = x1 - direction * head
    draw.line([(x0, y), (base, y)], fill=color, width=round(width))
    draw.ellipse([x0 - r, y - r, x0 + r, y + r], fill=color)
    h = width * 1.55
    draw.polygon([(x1, y), (base, y - h), (base, y + h)], fill=color)


def build(source_dir, size, theme_name):
    theme = THEMES[theme_name]
    big = size * SS
    sun = Image.open(os.path.join(source_dir, "atlas-icon-dark.png")).convert("RGBA")

    # 1. Tile: a vertical gradient in a rounded square, with a soft light across the top.
    tile = vertical_gradient(big, theme["top"], theme["bottom"])
    mask = rounded_mask(big, round(big * 0.23))
    light = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    ImageDraw.Draw(light).ellipse([-big * 0.25, -big * 0.55, big * 1.25, big * 0.42], fill=(255, 255, 255, 52))
    light = light.filter(ImageFilter.GaussianBlur(big * 0.06))
    tile.alpha_composite(light)
    tile.putalpha(mask)
    canvas = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    canvas.alpha_composite(tile)
    # hairline inner edge for a crisp, premium rim
    rim = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    ImageDraw.Draw(rim).rounded_rectangle([big * 0.006, big * 0.006, big - big * 0.006 - 1, big - big * 0.006 - 1],
                                          radius=round(big * 0.23), outline=(255, 255, 255, 40), width=max(1, round(big * 0.008)))
    canvas.alpha_composite(rim)

    # 2. Sunburst in the theme colour, centred in the upper part of the tile.
    sun_px = round(big * 0.54)
    s = sun.resize((sun_px, sun_px), Image.LANCZOS)
    tinted = Image.new("RGBA", (sun_px, sun_px), theme["sun"] + (255,))
    tinted.putalpha(s.getchannel("A"))
    canvas.alpha_composite(tinted, (round(big * 0.13), round(big * 0.10)))

    # 3. Translate mark: shadow, then a white disc with a light gradient, then the two arrows.
    r = big * 0.205
    cx = cy = big * 0.735
    shadow = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse([cx - r, cy - r + big * 0.022, cx + r, cy + r + big * 0.022], fill=(0, 0, 0, 120))
    shadow = shadow.filter(ImageFilter.GaussianBlur(big * 0.025))
    canvas.alpha_composite(shadow)

    disc_size = round(2 * r)
    disc_grad = Image.new("RGBA", (disc_size, disc_size))
    top_c, bottom_c = theme["disc"]
    dd = ImageDraw.Draw(disc_grad)
    for y in range(disc_size):
        t = y / max(1, disc_size - 1)
        dd.line([(0, y), (disc_size, y)], fill=tuple(round(top_c[i] + (bottom_c[i] - top_c[i]) * t) for i in range(3)) + (255,))
    disc_mask = Image.new("L", (disc_size, disc_size), 0)
    ImageDraw.Draw(disc_mask).ellipse([0, 0, disc_size - 1, disc_size - 1], fill=255)
    disc = Image.new("RGBA", (disc_size, disc_size), (0, 0, 0, 0))
    disc.paste(disc_grad, (0, 0), disc_mask)
    canvas.alpha_composite(disc, (round(cx - r), round(cy - r)))

    w = big * 0.042
    arrows = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    ad = ImageDraw.Draw(arrows)
    arrow(ad, cx - r * 0.56, cx + r * 0.46, cy - r * 0.24, head=r * 0.46, width=w, color=theme["ink"] + (255,))
    arrow(ad, cx + r * 0.56, cx - r * 0.46, cy + r * 0.24, head=r * 0.46, width=w, color=theme["ink"] + (255,))
    canvas.alpha_composite(arrows)

    return canvas.resize((size, size), Image.LANCZOS)


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    source_dir, out_dir = sys.argv[1], sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    for size in SIZES:
        for theme_name, suffix in (("neutral", ""), ("translated", "-translated")):
            path = os.path.join(out_dir, f"icon-{size}{suffix}.png")
            build(source_dir, size, theme_name).save(path, optimize=True)
            print("wrote", path)


if __name__ == "__main__":
    main()
