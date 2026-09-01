"""Give duplicated Season 1 portraits their own look.

Seven pairs of dopebudz PVE cards point at correctly-named but byte-identical
source files on R2, so both cards in a pair render the same picture. There is no
replacement artwork on R2 or the external card-art host, and no art can be
generated here, so the next best thing is to treat the shared base differently
per card: each treatment is picked from the card's own name and role, which is
enough for the two cards to read as different characters at card size.

This is a stopgap. The real fix is new artwork — drop a URL into
`catalog/pve-art-overrides.json` and it wins over everything else.

  python lab/tools/restyle-pve-art.py --dry-run
  python lab/tools/restyle-pve-art.py
"""
import io
import json
import pathlib
import subprocess
import sys
import time
import urllib.parse
import urllib.request

from PIL import Image, ImageChops, ImageEnhance, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parents[2]
CATALOG = ROOT / "catalog" / "catalog.json"
OUT_DIR = ROOT / "lab" / "tools" / "_restyled"
MAP_FILE = ROOT / "catalog" / "pve-art-overrides.json"
CDN = "https://assets.grudge-studio.com"
PREFIX = "sprites/thc-pve/styled"
MAX_EDGE = 640

DRY = "--dry-run" in sys.argv

# card name -> treatment. Only cards whose art collides with another card's, and
# only the half of each pair whose name suggests a distinct look. Keyed by name
# rather than id: the Season 1 roster ids are positional (`image-22`) and would
# silently re-point at the wrong card if the roster is ever re-ordered.
STYLES = {
    # Bronx boss. Shares the fur-coat gunman with Solara; "Hash Specter" wants
    # to be the ghost of that figure, not the figure.
    "Chronos the Hash Specter": "specter",
    # Brooklyn boss, same base. "Sungrown Sentinel" takes the warm, lit read.
    "Solara the Sungrown Sentinel": "sungrown",
    # Manhattan goon. Shares the lab-chemist with Cannachemist; "Blade Runner"
    # takes neon noir so the chemist keeps the clean white-lab read.
    "Resin Blade Runner": "neonnoir",
}


def fetch(url):
    safe = urllib.parse.quote(url, safe=":/?#[]@!$&'()*+,;=%~")
    req = urllib.request.Request(safe, headers={"User-Agent": "grudge-codex-tools/1.0"})
    last = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=240) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.5 * (attempt + 1))
    raise last


def duotone(img, shadow, light, mid=None):
    """Remap luminance onto a three-stop ramp, keeping the original alpha."""
    lum = img.convert("L")
    mid = mid or tuple((shadow[i] + light[i]) // 2 for i in range(3))
    ramp = []
    for i in range(256):
        t = i / 255
        if t < 0.5:
            k = t * 2
            ramp.append(tuple(int(shadow[c] + (mid[c] - shadow[c]) * k) for c in range(3)))
        else:
            k = (t - 0.5) * 2
            ramp.append(tuple(int(mid[c] + (light[c] - mid[c]) * k) for c in range(3)))
    out = Image.new("RGB", img.size)
    out.putdata([ramp[p] for p in lum.getdata()])
    res = out.convert("RGBA")
    res.putalpha(img.getchannel("A"))
    return res


def silhouette(img, colour, grow=0, blur=0):
    """A solid-colour copy of the subject, optionally fattened and softened."""
    a = img.getchannel("A")
    if grow:
        a = a.filter(ImageFilter.MaxFilter(grow * 2 + 1))
    if blur:
        a = a.filter(ImageFilter.GaussianBlur(blur))
    sil = Image.new("RGBA", img.size, colour + (255,))
    sil.putalpha(a)
    return sil


def rim_light(img, colour, width=6, blur=4):
    """Glow that hugs the outside edge of the subject."""
    grown = silhouette(img, colour, grow=width, blur=blur)
    inner = img.getchannel("A").filter(ImageFilter.GaussianBlur(blur * 0.5))
    a = ImageChops.subtract(grown.getchannel("A"), inner)
    grown.putalpha(a)
    return grown


def vertical_fade(img, start=0.45, floor=0.30):
    """Fade the subject out toward its feet — the ghost read."""
    w, h = img.size
    a = img.getchannel("A")
    mask = Image.new("L", (1, h))
    px = mask.load()
    for y in range(h):
        t = y / max(1, h - 1)
        if t <= start:
            px[0, y] = 255
        else:
            k = (t - start) / (1 - start)
            px[0, y] = int(255 * (1 - (1 - floor) * k))
    a = ImageChops.multiply(a, mask.resize((w, h)))
    out = img.copy()
    out.putalpha(a)
    return out


def style_specter(img):
    """Cold, translucent, wreathed in its own smoke."""
    base = duotone(img, (12, 16, 44), (198, 232, 255), (58, 96, 168))
    base = ImageEnhance.Contrast(base).enhance(1.22)
    base = vertical_fade(base, start=0.42, floor=0.26)
    canvas = Image.new("RGBA", img.size, (0, 0, 0, 0))
    haze = silhouette(img, (96, 190, 255), grow=10, blur=26)
    haze.putalpha(haze.getchannel("A").point(lambda p: int(p * 0.55)))
    canvas.alpha_composite(haze)
    canvas.alpha_composite(base)
    edge = rim_light(base, (150, 226, 255), width=3, blur=3)
    edge.putalpha(edge.getchannel("A").point(lambda p: int(p * 0.8)))
    canvas.alpha_composite(edge)
    return canvas


def style_sungrown(img):
    """Warm, backlit, gold-rimmed."""
    base = duotone(img, (46, 22, 8), (255, 246, 208), (168, 108, 30))
    base = ImageEnhance.Contrast(base).enhance(1.18)
    base = ImageEnhance.Color(base).enhance(1.12)
    canvas = Image.new("RGBA", img.size, (0, 0, 0, 0))
    bloom = silhouette(img, (255, 196, 72), grow=14, blur=30)
    bloom.putalpha(bloom.getchannel("A").point(lambda p: int(p * 0.6)))
    canvas.alpha_composite(bloom)
    canvas.alpha_composite(base)
    edge = rim_light(base, (255, 226, 138), width=4, blur=3)
    canvas.alpha_composite(edge)
    return canvas


def style_neonnoir(img):
    """Neon noir: cool the subject hard, then relight it from two coloured sides.

    The other half of this pair keeps the clean white-lab read, so this one has
    to change value *and* hue — a tint alone still read as the same picture at
    card size.
    """
    base = ImageEnhance.Color(img).enhance(0.35)
    base = ImageEnhance.Brightness(base).enhance(0.72)
    base = ImageEnhance.Contrast(base).enhance(1.45)
    r, g, b, a = base.split()
    r = r.point(lambda p: min(255, int(p * 0.82 + 10)))
    g = g.point(lambda p: min(255, int(p * 0.90 + 6)))
    b = b.point(lambda p: min(255, int(p * 1.35 + 26)))
    base = Image.merge("RGBA", (r, g, b, a))

    w, h = base.size
    # Magenta key from the left, cyan fill from the right, both masked to the
    # subject so the relight follows the figure instead of washing the frame.
    ramp = Image.new("L", (w, 1))
    rp = ramp.load()
    for x in range(w):
        rp[x, 0] = int(255 * max(0.0, 1 - x / max(1, w - 1)) ** 1.4)
    left = ramp.resize((w, h))
    right = ramp.transpose(Image.FLIP_LEFT_RIGHT).resize((w, h))
    alpha = base.getchannel("A")
    for colour, mask, amount in (((255, 46, 190), left, 0.62), ((60, 240, 255), right, 0.5)):
        lamp = Image.new("RGBA", base.size, colour + (255,))
        m = ImageChops.multiply(mask, alpha).point(lambda p: int(p * amount))
        lamp.putalpha(m)
        base = Image.alpha_composite(base, lamp)
    base.putalpha(alpha)

    canvas = Image.new("RGBA", img.size, (0, 0, 0, 0))
    glow = silhouette(img, (255, 40, 190), grow=13, blur=28)
    glow.putalpha(glow.getchannel("A").point(lambda p: int(p * 0.62)))
    canvas.alpha_composite(glow)
    canvas.alpha_composite(base)
    edge = rim_light(base, (80, 255, 240), width=4, blur=3)
    canvas.alpha_composite(edge)
    return canvas


STYLE_FN = {
    "specter": style_specter,
    "sungrown": style_sungrown,
    "neonnoir": style_neonnoir,
}


def main():
    cat = json.loads(CATALOG.read_text(encoding="utf8"))
    by_name = {c.get("name"): c for c in cat.get("cards", [])}
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    results = {}

    for name, style in STYLES.items():
        card = by_name.get(name)
        if not card:
            print(f"  MISS {name} — not in catalog")
            continue
        src = card.get("mintImage") or card.get("image")
        slug = pathlib.Path(urllib.parse.urlparse(src).path).stem
        img = Image.open(io.BytesIO(fetch(src))).convert("RGBA")
        box = img.getchannel("A").getbbox()
        if box:
            img = img.crop(box)
        out = STYLE_FN[style](img)
        box = out.getchannel("A").getbbox()
        if box:
            out = out.crop(box)
        out.thumbnail((MAX_EDGE, MAX_EDGE), Image.LANCZOS)
        buf = io.BytesIO()
        out.save(buf, "WEBP", quality=92, method=6)
        (OUT_DIR / f"{slug}.webp").write_bytes(buf.getvalue())
        results[card["id"]] = f"{CDN}/{PREFIX}/{slug}.webp"
        print(f"  {style:<9} {name:<34} -> {len(buf.getvalue())/1024:.0f} KB")

    if DRY:
        print("\ndry run — nothing uploaded")
        return 0
    if not results:
        print("nothing to upload")
        return 1

    existing = {}
    if MAP_FILE.exists():
        existing = json.loads(MAP_FILE.read_text(encoding="utf8")).get("byCardId", {})
    existing.update(results)
    MAP_FILE.write_text(json.dumps({
        "note": "Deliberate art overrides — wins over every other portrait source. "
                "Point an entry at real replacement artwork when it exists.",
        "cdn": CDN, "prefix": PREFIX, "byCardId": existing,
    }, indent=1), encoding="utf8")
    print(f"-> {MAP_FILE.relative_to(ROOT)}")

    up = ROOT / "lab" / "tools" / "_upload_styled.mjs"
    up.write_text(
        'import fs from "node:fs";\n'
        'import path from "node:path";\n'
        'import { pathToFileURL } from "node:url";\n'
        'const { putR2Object } = await import(pathToFileURL("F:/GitHub/ObjectStore/scripts/lib/r2-s3-sigv4.mjs").href);\n'
        f'const dir = {json.dumps(str(OUT_DIR))};\n'
        f'const prefix = {json.dumps(PREFIX)};\n'
        'const files = fs.readdirSync(dir).filter((f) => f.endsWith(".webp"));\n'
        'let ok = 0;\n'
        'for (const f of files) {\n'
        '  const body = fs.readFileSync(path.join(dir, f));\n'
        '  for (let a = 0; a < 5; a++) {\n'
        '    try { await putR2Object({ key: `${prefix}/${f}`, body, contentType: "image/webp" }); ok++; break; }\n'
        '    catch { await new Promise((r) => setTimeout(r, 1200 * (a + 1))); }\n'
        '  }\n'
        '}\n'
        'console.log("uploaded", ok, "/", files.length);\n',
        encoding="utf8")
    print("uploading…")
    subprocess.run(["node", str(up)], check=True, cwd=str(ROOT))
    up.unlink(missing_ok=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
