"""Remake DopeBudz PVE goon/boss portraits in the THC Growerz NFT art style.

Growerz reference (value.thc-labz.xyz/listings): bold black character-comic
outlines, flat/posterized saturated color fills, thick colored outline ring
around the whole figure, and a radiating diagonal-stripe neon background
(purple/green/yellow/pink/blue) behind a centered character bust/figure.

This script:
  1. Loads each existing PVE portrait PNG (already-cutout character art).
  2. Posterizes + boosts saturation for a flat "toon cel" fill look.
  3. Adds a bold black ink outline around all internal edges (comic linework)
     plus a thick colored outline ring around the silhouette.
  4. Composites onto a per-city radiating-stripe neon background (own hue per
     city, seeded so it's stable across reruns).
  5. Writes card-sized WebP output + a manifest for upload/catalog override.

Usage:
  python toonify_growerz.py --dry-run     # process a few, no batch write
  python toonify_growerz.py               # process full roster
"""
import colorsys
import hashlib
import json
import math
import pathlib
import sys

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageOps

ROOT = pathlib.Path(__file__).resolve().parent
SRC_DIR = pathlib.Path(
    "C:/Users/nugye/Documents/THC-Labz-Battle/THC-Labz-Battle/client/public/card-art"
)
CUTOUT_DIR = pathlib.Path("F:/GitHub/duelyst/lab/tools/_cutouts")
OUT_DIR = ROOT / "out"
CARD_W, CARD_H = 768, 768
DRY = "--dry-run" in sys.argv


def seed(text, salt):
    return int(hashlib.md5(f"{salt}:{text}".encode()).hexdigest()[:8], 16)


def slug(text):
    return "".join(ch.lower() if ch.isalnum() else "-" for ch in text).strip("-")


def key_out_flat_background(img, tolerance=26):
    """Flood-fill transparency from the 4 corners for un-cutout flat-plate art.

    Several source PNGs still carry a solid grey/near-black studio plate
    instead of real alpha. BFS out from each corner over near-identical
    pixels and zero their alpha so they composite the same as the rest of
    the roster instead of rendering as a giant colored rectangle.
    """
    rgba = img.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()
    seen = bytearray(w * h)
    stack = []
    for cx, cy in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        stack.append((cx, cy))
    corner_colours = [px[cx, cy][:3] for cx, cy in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1))]

    def close(a, b):
        return abs(a[0] - b[0]) <= tolerance and abs(a[1] - b[1]) <= tolerance and abs(a[2] - b[2]) <= tolerance

    while stack:
        x, y = stack.pop()
        idx = y * w + x
        if seen[idx]:
            continue
        seen[idx] = 1
        r, g, b, a = px[x, y]
        if not any(close((r, g, b), c) for c in corner_colours):
            continue
        px[x, y] = (r, g, b, 0)
        if x > 0:
            stack.append((x - 1, y))
        if x < w - 1:
            stack.append((x + 1, y))
        if y > 0:
            stack.append((x, y - 1))
        if y < h - 1:
            stack.append((x, y + 1))
    return rgba


# ---------------------------------------------------------------------------
# Toon / cel-shade the character art
# ---------------------------------------------------------------------------

def posterize_flatten(img, levels=5):
    """Flatten to broad color bands like flat cel-shaded comic art."""
    rgb = img.convert("RGB")
    rgb = ImageEnhance.Color(rgb).enhance(1.55)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.1)
    rgb = ImageEnhance.Brightness(rgb).enhance(1.18)
    step = 256 // levels
    lut = [min(255, (i // step) * step + step // 2) for i in range(256)]
    rgb = rgb.point(lut * 3)
    out = rgb.convert("RGBA")
    out.putalpha(img.getchannel("A"))
    return out


def ink_outline(img, thickness=5):
    """Bold black comic linework: dark internal edges + full silhouette ink.

    Edge detection runs on a heavily smoothed/posterized copy so only real
    color-region boundaries produce lines — running it on the detailed source
    crushes textured armor/fur into a solid black blob instead of clean linework.
    """
    alpha = img.getchannel("A")
    smooth = img.convert("RGB").filter(ImageFilter.GaussianBlur(1.4))
    gray = smooth.convert("L")
    edges = gray.filter(ImageFilter.FIND_EDGES)
    edges = edges.point(lambda p: 255 if p > 46 else 0)
    edges = ImageChops.multiply(edges, alpha)
    edges = edges.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.4))
    ink = Image.new("RGBA", img.size, (10, 8, 6, 255))
    ink.putalpha(edges)
    out = Image.alpha_composite(img, ink)

    # Silhouette ink ring around the whole figure (outer contour line).
    outer = alpha.filter(ImageFilter.MaxFilter(thickness * 2 + 1))
    ring = ImageChops.subtract(outer, alpha)
    ring_layer = Image.new("RGBA", img.size, (8, 6, 5, 255))
    ring_layer.putalpha(ring)
    canvas = Image.new("RGBA", img.size, (0, 0, 0, 0))
    canvas.alpha_composite(ring_layer)
    canvas.alpha_composite(out)
    return canvas


def colored_rim(img, colour, thickness=9):
    """Thick saturated color ring outside the ink line (Growerz card-frame look)."""
    alpha = img.getchannel("A")
    grown = alpha.filter(ImageFilter.MaxFilter(thickness * 2 + 1))
    ring = ImageChops.subtract(grown, alpha.filter(ImageFilter.MaxFilter(3)))
    layer = Image.new("RGBA", img.size, colour + (255,))
    layer.putalpha(ring)
    canvas = Image.new("RGBA", img.size, (0, 0, 0, 0))
    canvas.alpha_composite(layer)
    canvas.alpha_composite(img)
    return canvas


def toonify(img, rim_colour):
    box = img.getchannel("A").getbbox()
    if box:
        img = img.crop(box)
    flat = posterize_flatten(img)
    inked = ink_outline(flat, thickness=5)
    rimmed = colored_rim(inked, rim_colour, thickness=8)
    return rimmed


# ---------------------------------------------------------------------------
# Radiating neon-stripe background (the psychedelic ray pattern from the ref)
# ---------------------------------------------------------------------------

RAY_PALETTES = [
    [(168, 24, 214), (46, 214, 60), (255, 214, 20), (255, 40, 150), (30, 190, 255)],
    [(255, 90, 20), (30, 220, 170), (140, 40, 220), (255, 220, 30), (255, 30, 90)],
    [(20, 120, 255), (220, 20, 255), (60, 230, 60), (255, 160, 20), (255, 20, 90)],
]


def radiating_background(w, h, city_seed, palette):
    """Pinwheel of angled color bands radiating from a center, like the ref art."""
    diag = int(math.hypot(w, h)) + 4
    big = max(w, h) * 2
    canvas = Image.new("RGB", (big, big), palette[0])
    draw = ImageDraw.Draw(canvas)
    cx, cy = big / 2, big / 2
    n_rays = 26
    base_angle = (city_seed % 360)
    for i in range(n_rays):
        a0 = math.radians(base_angle + i * (360 / n_rays))
        a1 = math.radians(base_angle + (i + 1) * (360 / n_rays))
        colour = palette[i % len(palette)]
        r = diag * 1.5
        pts = [
            (cx, cy),
            (cx + r * math.cos(a0), cy + r * math.sin(a0)),
            (cx + r * math.cos(a1), cy + r * math.sin(a1)),
        ]
        draw.polygon(pts, fill=colour)
    canvas = canvas.filter(ImageFilter.GaussianBlur(1.2))
    # Crop back to target size, centered.
    left = (big - w) // 2
    top = (big - h) // 2
    canvas = canvas.crop((left, top, left + w, top + h))
    # Slight radial darken toward edges so the character pops in the middle.
    vig = Image.new("L", (w, h), 0)
    vp = vig.load()
    ccx, ccy = w / 2, h / 2
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            d = (((x - ccx) / ccx) ** 2 + ((y - ccy) / ccy) ** 2) ** 0.5
            v = max(0, min(200, int(200 * max(0.0, d - 0.35) / 0.9)))
            for yy in (y, y + 1):
                for xx in (x, x + 1):
                    if xx < w and yy < h:
                        vp[xx, yy] = v
    shade = Image.new("RGBA", (w, h), (2, 2, 4, 255))
    shade.putalpha(vig)
    out = canvas.convert("RGBA")
    out.alpha_composite(shade)
    return out


def compose_card(char_img, city, role):
    s = seed(city, "growerz-bg")
    palette = RAY_PALETTES[s % len(RAY_PALETTES)]
    bg = radiating_background(CARD_W, CARD_H, s, palette)

    aspect = char_img.width / max(1, char_img.height)
    is_scenic = aspect > 1.15  # wide item/building art: contain-fit, no ground shadow
    if is_scenic:
        max_w = CARD_W * 0.88
        max_h = CARD_H * 0.72
        scale = min(max_w / char_img.width, max_h / char_img.height)
    else:
        scale = (CARD_H * (0.92 if role == "boss" else 0.82)) / char_img.height
    new_w = max(1, round(char_img.width * scale))
    new_h = max(1, round(char_img.height * scale))
    char_resized = char_img.resize((new_w, new_h), Image.LANCZOS)

    if not is_scenic:
        # Soft dark contact shadow so the flat character reads as grounded.
        sh_w = max(1, int(new_w * 0.55))
        sh_h = max(1, int(new_h * 0.10))
        pad = max(4, sh_h)
        sh = Image.new("RGBA", (sh_w + pad * 2, sh_h + pad * 2), (0, 0, 0, 0))
        ImageDraw.Draw(sh).ellipse([pad, pad, pad + sh_w, pad + sh_h], fill=(0, 0, 0, 150))
        sh = sh.filter(ImageFilter.GaussianBlur(sh_h / 3 or 1))
        sx = (bg.width - sh.width) // 2
        sy = bg.height - int(CARD_H * 0.04) - sh_h // 2 - pad
        shadow = Image.new("RGBA", bg.size, (0, 0, 0, 0))
        shadow.alpha_composite(sh, (sx, max(0, sy)))
        bg = Image.alpha_composite(bg, shadow)

    x = (bg.width - new_w) // 2
    y = (bg.height - new_h) // 2 if is_scenic else bg.height - new_h - int(CARD_H * 0.04)
    out = bg.copy()
    out.alpha_composite(char_resized, (x, max(0, y)))
    return out.convert("RGB")


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    roster_path = pathlib.Path(
        "D:/Games/Models/THC_CARD_PACKS_OPTIONS/Cnftspriteasset/battle-cnft/production/city-pve.json"
    )
    pve = json.loads(roster_path.read_text(encoding="utf8"))
    manifest = {}
    count = 0
    limit = 6 if DRY else 10_000

    entries = []
    for city in pve.get("citiesRoster", []):
        if city.get("boss"):
            entries.append((city["city"], "boss", city["boss"]))
        for g in city.get("goons", []):
            entries.append((city["city"], "goon", g))

    for city, role, row in entries:
        if count >= limit:
            break
        img_path = row.get("image", "")
        fname = pathlib.Path(img_path).name
        stem = pathlib.Path(fname).stem
        cutout = CUTOUT_DIR / f"{stem}.webp"
        src = SRC_DIR / fname
        if cutout.exists():
            char = Image.open(cutout).convert("RGBA")
        elif src.exists():
            char = Image.open(src).convert("RGBA")
            has_alpha = char.getchannel("A").getextrema()[0] < 250
            if not has_alpha:
                char = key_out_flat_background(char)
        else:
            print(f"  MISS {row.get('name')} -> {fname} not found in card-art/")
            continue
        s = seed(row.get("name", fname), "rim")
        rim_colour = RAY_PALETTES[s % len(RAY_PALETTES)][(s >> 4) % 5]
        toon = toonify(char, rim_colour)
        card = compose_card(toon, city, role)
        out_slug = slug(row.get("name", fname))
        out_path = OUT_DIR / f"{out_slug}.webp"
        card.save(out_path, "WEBP", quality=90, method=6)
        manifest[fname.replace(".png", "")] = {
            "name": row.get("name"),
            "city": city,
            "role": role,
            "file": out_path.name,
        }
        count += 1
        print(f"  [{count}] {city:14} {role:5} {row.get('name')}")

    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=1), encoding="utf8")
    print(f"\n{count} portraits -> {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
