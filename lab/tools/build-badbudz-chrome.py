"""Build the THC Labz "BadBudz" card chrome from the brand art.

Layers the Codex paints per card:

  1. `bg-<tier>.png`    scene base — smoke/lab art, tinted to the strain, dark
                        enough that a sprite reads on top of it
  2. `buds-<tier>.png`  the strain bud row stacked into a full-window wallpaper
                        and mirror-tiled, so the card can pan it forever with no
                        seam and no horizontal cut line
  3. `logo.png`         THC Labz star, watermarked into the card's top-left

Rarity ladder runs cheapest strain to loudest: regz -> sour diesel -> sour d
purple -> purple haze -> runtz.

Run: python lab/tools/build-badbudz-chrome.py
"""
import json
import pathlib

from PIL import Image, ImageEnhance, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / "tcg-chrome" / "thc" / "_src"
OUT = ROOT / "tcg-chrome" / "thc"

# Card canvas; backgrounds are painted cover-fit into the frame's art window.
BG_W, BG_H = 220, 240

# The bud wallpaper. It is drawn at the full height of the art window, so its
# aspect sets how far the pan travels before it repeats: ~4 window-widths of
# drift. Rows are half the wall tall and advance by a third of that, so the buds
# interlock into a solid field instead of leaving stripes between rows.
BAND_H = 96
WALL_W, WALL_H = 620, 300
ROW_HEIGHT = 0.55
ROW_STEP = 0.26

# tier -> (strain art, scene art, tint rgb, scene brightness, crop bias, zoom)
# The banner and DopeBudz art have their own big logo/wordmark in the centre,
# which would fight the card's own top-left mark — bias the crop off-centre and
# zoom past it so we take the smoke and foliage instead.
#
# Brightness used to sit at 0.30-0.34, which crushed every scene to the same
# near-black mush: you could not tell the CO2 lab from the DopeBudz sign, and
# the bud wallpaper on top had nothing to sit against. These levels keep the
# sprite dominant while letting each tier's scene actually read.
TIERS = {
    "common":    ("strain-regz.jpg",              "lab-co2.png",  (150, 138, 96),  0.60, 0.22, 0.0),
    "uncommon":  ("strain-sourdiesel.jpg",        "lab-co2.png",  (120, 190, 110), 0.64, 0.80, 0.0),
    "rare":      ("strain-sourdiesel-purple.jpg", "banner.png",   (120, 175, 140), 0.62, 0.00, 0.60),
    "epic":      ("strain-purplehaze.jpg",        "banner.png",   (168, 120, 210), 0.86, 1.00, 0.60),
    "legendary": ("strain-runtz.jpg",             "dopebudz.png", (110, 235, 120), 0.62, 0.02, 0.30),
}


def key_black(img, cutoff=34, soft=78):
    """Strain banners sit on flat black — turn that into real alpha.

    Pixels darker than `cutoff` go fully transparent, and everything up to
    `soft` ramps in, so the bud silhouettes keep a clean edge instead of a
    hard black halo.
    """
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            lum = max(r, g, b)
            if lum <= cutoff:
                px[x, y] = (r, g, b, 0)
            elif lum < soft:
                a = int(round(255 * (lum - cutoff) / (soft - cutoff)))
                px[x, y] = (r, g, b, a)
    return img


def mirror_tile(img):
    """[A | mirror(A)] wraps seamlessly in both directions when panned."""
    w, h = img.size
    out = Image.new("RGBA", (w * 2, h), (0, 0, 0, 0))
    out.alpha_composite(img, (0, 0))
    out.alpha_composite(img.transpose(Image.FLIP_LEFT_RIGHT), (w, 0))
    return out


def bud_wall(strip):
    """Turn the strain's bud row into a full-height, pannable wallpaper.

    The source is a banner: one row of buds with dead space above it. Tiled as a
    band it could only ever cover a strip of the card, which left a hard
    horizontal cut across the art window. Trimming to the buds and stacking that
    row at a heavy overlap fills the whole window instead — the buds interlock
    rather than sitting in rows with dead stripes between them — and the final
    mirror makes the horizontal pan seamless.
    """
    box = strip.getchannel("A").getbbox()
    if box:
        strip = strip.crop(box)
    rw, rh = strip.size
    row_h = max(1, round(WALL_H * ROW_HEIGHT))
    row = strip.resize((max(1, round(rw * row_h / rh)), row_h), Image.LANCZOS)
    step = max(1, round(row_h * ROW_STEP))
    wall = Image.new("RGBA", (WALL_W, WALL_H), (0, 0, 0, 0))
    r = 0
    y = -round(row_h * 0.5)
    while y < WALL_H:
        # Alternate rows flip and shift by an off-beat fraction of the row width,
        # so the stack never lines up into an obvious grid.
        src = row.transpose(Image.FLIP_LEFT_RIGHT) if r % 2 else row
        x = -round((row.width * 0.37 * r) % row.width)
        while x < WALL_W:
            wall.alpha_composite(src, (x, y))
            x += src.width
        y += step
        r += 1
    return mirror_tile(wall)


def wall_coverage(wall):
    """Fraction of the thinnest scanline that is opaque enough to read."""
    a = wall.getchannel("A")
    w, h = a.size
    px = a.load()
    worst = 1.0
    for y in range(0, h, 4):
        on = sum(1 for x in range(0, w, 4) if px[x, y] > 40)
        worst = min(worst, on / max(1, len(range(0, w, 4))))
    return worst


def cover(img, w, h, bias=0.5, zoom=0.0):
    """Cover-fit, taking the crop from `bias` across the wide axis (0=left).

    `zoom` scales past cover so a central wordmark can be cropped right out.
    """
    iw, ih = img.size
    s = max(w / iw, h / ih) * (1.0 + zoom)
    r = img.resize((max(1, round(iw * s)), max(1, round(ih * s))), Image.LANCZOS)
    x = round((r.width - w) * bias)
    y = round((r.height - h) * 0.5)
    return r.crop((x, y, x + w, y + h))


def tint(img, rgb, amount=0.45):
    layer = Image.new("RGB", img.size, rgb)
    return Image.blend(img.convert("RGB"), layer, amount)


def build_scene(scene_name, rgb, brightness, bias, zoom=0.0):
    scene = Image.open(SRC / scene_name).convert("RGB")
    scene = cover(scene, BG_W, BG_H, bias, zoom)
    # A light tint keys the scene to the strain without painting over it — at the
    # old 0.34 every tier drifted toward the same flat wash.
    scene = tint(scene, rgb, 0.22)
    scene = ImageEnhance.Brightness(scene).enhance(brightness)
    scene = ImageEnhance.Contrast(scene).enhance(1.16)
    scene = ImageEnhance.Color(scene).enhance(1.12)
    scene = scene.filter(ImageFilter.GaussianBlur(0.35))  # keep the sprite dominant
    out = scene.convert("RGBA")

    # Vignette so the frame edge stays dark and the centre reads. It starts
    # further out and lands softer than it used to, which is what was swallowing
    # the scene's corners entirely.
    vig = Image.new("L", (BG_W, BG_H), 0)
    vp = vig.load()
    cx, cy = BG_W / 2, BG_H / 2
    for y in range(BG_H):
        for x in range(BG_W):
            d = (((x - cx) / cx) ** 2 + ((y - cy) / cy) ** 2) ** 0.5
            vp[x, y] = max(0, min(255, int(150 * max(0.0, d - 0.66) / 0.72)))
    shade = Image.new("RGBA", (BG_W, BG_H), (4, 8, 5, 255))
    shade.putalpha(vig)
    out.alpha_composite(shade)
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    meta = {}

    logo = Image.open(SRC / "logo.png").convert("RGBA")
    logo = logo.resize((46, 46), Image.LANCZOS)
    logo.save(OUT / "logo.png")

    for tier, (strain, scene_name, rgb, bright, bias, zoom) in TIERS.items():
        scene = build_scene(scene_name, rgb, bright, bias, zoom)
        scene.save(OUT / f"bg-{tier}.png")

        buds = Image.open(SRC / strain)
        buds = buds.resize((round(buds.width * BAND_H / buds.height), BAND_H), Image.LANCZOS)
        buds = key_black(buds)
        buds = ImageEnhance.Brightness(buds).enhance(0.92)
        wall = bud_wall(buds)
        # Keep the published name: the layer is still "the buds", and the card
        # registry's art rows for it are already live in D1.
        wall.save(OUT / f"buds-{tier}.png")
        cover_frac = wall_coverage(wall)
        if cover_frac < 0.6:
            raise SystemExit(
                f"{tier}: bud wall thins to {cover_frac:.0%} on one scanline — "
                "that is a dead stripe, raise ROW_HEIGHT or lower ROW_STEP")

        meta[tier] = {
            "bg": f"thc/bg-{tier}.png",
            "buds": f"thc/buds-{tier}.png",
            "wallW": wall.width,
            "wallH": wall.height,
            "strain": pathlib.Path(strain).stem.replace("strain-", ""),
        }
        print(f"{tier:10} bg {scene.size}  wall {wall.size}  cover {cover_frac:.0%}  <- {strain}")

    for stale in OUT.glob("budwall-*.png"):
        stale.unlink()

    (OUT / "chrome.json").write_text(json.dumps({
        "note": "THC Labz BadBudz card chrome — scene base + panning full-window bud wallpaper",
        "logo": "thc/logo.png",
        "bgSize": [BG_W, BG_H],
        "tiers": meta,
    }, indent=1), encoding="utf8")
    print(f"\n-> {(OUT / 'chrome.json').relative_to(ROOT)}")


if __name__ == "__main__":
    main()
