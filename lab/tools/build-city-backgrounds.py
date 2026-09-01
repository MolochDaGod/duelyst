"""Give every dopebudz city its own PVE card background.

All 72 Season 1 cards shared one background, so the 7 pairs that duplicate
portrait art upstream rendered *pixel-identical* — which reads as a bug even
though the wiring is right. Each of the 12 cities now gets its own tinted,
differently-framed scene, so a Bronx boss and a Brooklyn boss never look alike.

City hue/crop are derived from the city name, so the mapping is stable and a
rebuild never reshuffles which city looks like what.

Run: python lab/tools/build-city-backgrounds.py
"""
import colorsys
import hashlib
import json
import pathlib

from PIL import Image, ImageEnhance, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parents[2]
CATALOG = ROOT / "catalog" / "catalog.json"
SRC = ROOT / "tcg-chrome" / "thc" / "_src"
OUT = ROOT / "tcg-chrome" / "cities"
BG_W, BG_H = 200, 200

# Cities rotate through the brand scenes so neighbours never share a backdrop.
SCENES = ["lab-co2.png", "banner.png", "dopebudz.png"]


def seed(text, salt):
    return int(hashlib.md5(f"{salt}:{text}".encode()).hexdigest()[:8], 16)


def slug(text):
    return "".join(ch.lower() if ch.isalnum() else "-" for ch in text).strip("-")


def cover(img, w, h, bias, zoom, vbias=0.5):
    iw, ih = img.size
    s = max(w / iw, h / ih) * (1.0 + zoom)
    r = img.resize((max(1, round(iw * s)), max(1, round(ih * s))), Image.LANCZOS)
    x = round((r.width - w) * bias)
    y = round((r.height - h) * vbias)
    return r.crop((x, y, x + w, y + h))


def vignette(img):
    w, h = img.size
    vig = Image.new("L", (w, h), 0)
    vp = vig.load()
    cx, cy = w / 2, h / 2
    for y in range(h):
        for x in range(w):
            d = (((x - cx) / cx) ** 2 + ((y - cy) / cy) ** 2) ** 0.5
            vp[x, y] = max(0, min(255, int(210 * max(0.0, d - 0.5) / 0.8)))
    shade = Image.new("RGBA", (w, h), (4, 7, 6, 255))
    shade.putalpha(vig)
    out = img.convert("RGBA")
    out.alpha_composite(shade)
    return out


def main():
    cat = json.loads(CATALOG.read_text(encoding="utf8"))
    cities = sorted({c["city"] for c in cat.get("cards", []) if c.get("city")})
    if not cities:
        print("no cities in catalog")
        return 1
    OUT.mkdir(parents=True, exist_ok=True)

    scenes = {n: Image.open(SRC / n).convert("RGB") for n in SCENES}
    mapping = {}
    for i, city in enumerate(cities):
        s = seed(city, "city")
        scene_name = SCENES[i % len(SCENES)]
        # Hue spread across the wheel keeps neighbouring cities clearly apart.
        hue = (i / len(cities) + (s % 97) / 970.0) % 1.0
        r, g, b = colorsys.hsv_to_rgb(hue, 0.52, 0.88)
        rgb = (int(r * 255), int(g * 255), int(b * 255))

        if scene_name == "lab-co2.png":
            # No wordmark — free to roam the whole frame.
            bias = 0.06 + ((s >> 8) % 88) / 100.0
            vbias = 0.5
            zoom = 0.15 + ((s >> 16) % 35) / 100.0
        else:
            # banner/DopeBudz carry a big centred logo. Take a clean margin
            # instead: one of the side thirds, and for DopeBudz the lower road
            # area rather than the sign itself.
            left = ((s >> 8) & 1) == 0
            bias = (0.00 + ((s >> 12) % 16) / 100.0) if left else (1.00 - ((s >> 12) % 16) / 100.0)
            vbias = 0.82 if scene_name == "dopebudz.png" else 0.5
            zoom = 0.55 + ((s >> 16) % 30) / 100.0

        img = cover(scenes[scene_name], BG_W, BG_H, bias, zoom, vbias)
        img = Image.blend(img, Image.new("RGB", img.size, rgb), 0.34)
        img = ImageEnhance.Brightness(img).enhance(0.36)
        img = ImageEnhance.Contrast(img).enhance(1.1)
        img = img.filter(ImageFilter.GaussianBlur(0.7))
        out = vignette(img)

        name = f"{slug(city)}.png"
        out.save(OUT / name)
        mapping[city] = f"cities/{name}"
        print(f"{city:16} {scene_name:14} hue={hue:.2f} bias={bias:.2f} v={vbias:.2f} zoom={zoom:.2f} -> {name}")

    (OUT / "index.json").write_text(json.dumps({
        "note": "per-city PVE card backgrounds; keeps same-portrait cards visually distinct",
        "size": [BG_W, BG_H],
        "byCity": mapping,
    }, indent=1), encoding="utf8")
    print(f"\n{len(mapping)} cities -> {(OUT / 'index.json').relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
