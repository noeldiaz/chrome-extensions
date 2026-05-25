#!/usr/bin/env python3
"""Regenerate Blocker's icons from the reference stop-sign-hand artwork.

The icon is a 1:1 trace of `scripts/stop-hand-source.png` (a red stop-sign with a
white hand), recolored to our brand blue (#1e88e5) with the outside-the-octagon
background made transparent. Every pixel of the octagon / border / hand keeps the
source's exact shape and anti-aliasing — only the hue is remapped.

Run:  python3 scripts/recolor-icon.py     (needs Pillow: pip install pillow)
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts" / "stop-hand-source.png"
BLUE = (30, 136, 229)  # #1e88e5

src = Image.open(SRC).convert("RGBA")
w, h = src.size
sp = src.load()

out = Image.new("RGBA", (w, h))
op = out.load()

# Each pixel is a blend of RED(204,25,29) and WHITE(255). Estimate "redness" t
# from the green channel (white G=255, red G=25), then rebuild the pixel as the
# same blend between OUR BLUE and white. White stays white; the field becomes
# exactly #1e88e5; all anti-aliasing is preserved 1:1.
for y in range(h):
    for x in range(w):
        r, g, b, a = sp[x, y]
        t = (255 - g) / (255 - 25)
        t = 0.0 if t < 0 else 1.0 if t > 1 else t
        op[x, y] = (
            round(t * BLUE[0] + (1 - t) * 255),
            round(t * BLUE[1] + (1 - t) * 255),
            round(t * BLUE[2] + (1 - t) * 255),
            a,
        )

# Flood-fill the white background from the corners to transparent. The saturated
# blue octagon edge stops the fill, so the enclosed white hand + border survive.
mask = out.convert("RGB")
for seed in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
    ImageDraw.floodfill(mask, seed, (255, 0, 255), thresh=150)
mp = mask.load()
for y in range(h):
    for x in range(w):
        if mp[x, y] == (255, 0, 255):
            r, g, b, _ = op[x, y]
            op[x, y] = (r, g, b, 0)

# Crop the transparent margin so the octagon sits flush to the canvas edges.
bbox = out.getbbox()
if bbox:
    out = out.crop(bbox)

for n in (16, 32, 48, 128):
    out.resize((n, n), Image.LANCZOS).save(ROOT / "icons" / f"icon{n}.png")
out.resize((512, 512), Image.LANCZOS).save(ROOT / "icons" / "icon512.png")
print("wrote icons 16/32/48/128/512 — cropped to", out.size)
