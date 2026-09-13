"""Crisp GWA art: unsharp OG shots + bake Codex card faces (Scale2x idle + frame)."""
from __future__ import annotations

import io
import json
import re
import urllib.request
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OG = ROOT / "public" / "og"
CHROME = Path(r"F:\GitHub\duelyst\tcg-chrome")
LAYOUT = json.loads((CHROME / "LAYOUT.json").read_text(encoding="utf-8"))
UA = {"User-Agent": "gwa-art-bake"}


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def unsharp(im: Image.Image) -> Image.Image:
    rgb = im.convert("RGB")
    rgb = ImageEnhance.Contrast(rgb).enhance(1.12)
    rgb = ImageEnhance.Color(rgb).enhance(1.06)
    rgb = ImageEnhance.Sharpness(rgb).enhance(1.55)
    rgb = rgb.filter(ImageFilter.UnsharpMask(radius=1.4, percent=140, threshold=2))
    return rgb


def scale2x(im: Image.Image) -> Image.Image:
    src = im.convert("RGBA")
    w, h = src.size
    px = src.load()
    out = Image.new("RGBA", (w * 2, h * 2))
    d = out.load()
    for y in range(h):
        yu = max(0, y - 1)
        yd = min(h - 1, y + 1)
        for x in range(w):
            xl = max(0, x - 1)
            xr = min(w - 1, x + 1)
            p = px[x, y]
            a = px[x, yu]
            b = px[xr, y]
            c = px[xl, y]
            dn = px[x, yd]
            e0 = e1 = e2 = e3 = p
            if c == a and c != dn and a != b:
                e0 = a
            if a == b and a != c and b != dn:
                e1 = b
            if dn == c and dn != b and c != a:
                e2 = c
            if b == dn and b != a and dn != c:
                e3 = dn
            d[x * 2, y * 2] = e0
            d[x * 2 + 1, y * 2] = e1
            d[x * 2, y * 2 + 1] = e2
            d[x * 2 + 1, y * 2 + 1] = e3
    return out


def parse_plist(xml: str):
    frames = []
    for m in re.finditer(r"<key>([^<]+\.png)</key>\s*<dict>([\s\S]*?)</dict>", xml):
        name, inner = m.group(1), m.group(2)
        fm = re.search(r"frame</key>\s*<string>\{\{(\d+),(\d+)\},\{(\d+),(\d+)\}\}", inner)
        if not fm:
            continue
        stem = re.sub(r"_\d+$", "", name.lower().replace(".png", ""))
        anim = "idle"
        for key in ("breathing", "idle", "attack", "run"):
            if stem.endswith("_" + key) or stem == key:
                anim = key
                break
        frames.append(
            {
                "name": name,
                "x": int(fm.group(1)),
                "y": int(fm.group(2)),
                "w": int(fm.group(3)),
                "h": int(fm.group(4)),
                "anim": anim,
            }
        )
    frames.sort(key=lambda f: f["name"])
    return frames


def ink_box(im: Image.Image):
    a = im.split()[-1]
    bbox = a.point(lambda p: 255 if p > 12 else 0).getbbox()
    return bbox or (0, 0, im.width, im.height)


def blit_sprite(card: Image.Image, sprite: Image.Image, art: dict):
    box = ink_box(sprite)
    spr = sprite.crop(box)
    if max(spr.size) < 90:
        spr = scale2x(spr)
    aw, ah = art["w"], art["h"]
    s = min(aw / spr.width, ah / spr.height) * 0.92
    nw, nh = max(1, int(spr.width * s)), max(1, int(spr.height * s))
    spr = spr.resize((nw, nh), Image.Resampling.NEAREST)
    x = art["x"] + (aw - nw) // 2
    y = art["y"] + ah - nh
    card.alpha_composite(spr, (x, y))


def draw_card(frame: Image.Image, bg: Image.Image | None, sprite: Image.Image, art: dict, name: str, cost, atk, hp):
    card = Image.new("RGBA", (195, 284), (16, 12, 22, 255))
    if bg:
        bg = bg.convert("RGBA").resize((art["w"], art["h"]), Image.Resampling.BICUBIC)
        card.alpha_composite(bg, (art["x"], art["y"]))
    blit_sprite(card, sprite.convert("RGBA"), art)
    fr = frame.convert("RGBA").resize((195, 284), Image.Resampling.NEAREST)
    card.alpha_composite(fr, (0, 0))
    draw = ImageDraw.Draw(card)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/pala.ttf", 13)
        gem = ImageFont.truetype("C:/Windows/Fonts/pala.ttf", 16)
    except OSError:
        font = ImageFont.load_default()
        gem = font
    draw.text((12, 8), name[:22], fill=(255, 244, 214), font=font, stroke_width=2, stroke_fill=(18, 14, 28))
    stats = LAYOUT["stats"]
    for key, val, fill in (
        ("cost", cost, (58, 123, 217)),
        ("attack", atk, (201, 162, 39)),
        ("health", hp, (47, 158, 79)),
    ):
        s = stats[key]
        cx, cy, r = int(s["cx"]), int(s["cy"]), int(s["r"])
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=fill, outline=(18, 14, 28))
        t = str(val)
        bbox = draw.textbbox((0, 0), t, font=gem)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        draw.text((cx - tw / 2, cy - th / 2 - 1), t, fill="white", font=gem, stroke_width=2, stroke_fill=(18, 14, 28))
    return card.resize((390, 568), Image.Resampling.NEAREST)


def idle_from_plist(sheet: Image.Image, xml: str) -> Image.Image:
    frames = parse_plist(xml)
    idle = [f for f in frames if f["anim"] in ("idle", "breathing")] or frames
    f = idle[0]
    return sheet.crop((f["x"], f["y"], f["x"] + f["w"], f["y"] + f["h"]))


def bake_duelyst(unit_id: str, faction: str, name: str, cost, atk, hp, dest: Path):
    sheet = Image.open(io.BytesIO(fetch(f"https://assets.grudge-studio.com/sprites/duelyst/units/{unit_id}.png")))
    xml = fetch(f"https://assets.grudge-studio.com/sprites/duelyst/plists/{unit_id}.plist").decode("utf-8", "ignore")
    spr = idle_from_plist(sheet.convert("RGBA"), xml)
    frame = Image.open(CHROME / "frames" / f"{faction}.png")
    bg = Image.open(CHROME / "backgrounds" / f"{faction}.png")
    art = LAYOUT["factionArt"].get(faction, LAYOUT["art"])
    card = draw_card(frame, bg, spr, art, name, cost, atk, hp)
    dest.parent.mkdir(parents=True, exist_ok=True)
    card.save(dest, "PNG", optimize=True)
    print("baked", dest.name, card.size)


def bake_gw(slug: str, name: str, dest: Path):
    img = Image.open(io.BytesIO(fetch(f"https://assets.grudge-studio.com/sprites/grudawars/{slug}/idle.png"))).convert("RGBA")
    # first cell of the idle strip
    h = img.height
    w = img.width
    cell = min(w, h)
    cols = max(1, round(w / cell)) if w >= h else 1
    fw = w / cols
    spr = img.crop((0, 0, int(fw), h))
    frame = Image.open(CHROME / "frames" / "neutral.png")
    bg = Image.open(CHROME / "backgrounds" / "neutral.png")
    art = LAYOUT["factionArt"]["neutral"]
    card = draw_card(frame, bg, spr, art, name, 3, 3, 4)
    card.save(dest, "PNG", optimize=True)
    print("baked", dest.name, card.size)


def sharpen_ogs():
    for name in ("codex.png", "card.png", "duelyst.png", "grudawars.png"):
        p = OG / name
        if not p.exists():
            continue
        im = Image.open(p)
        out = unsharp(im)
        dest = OG / f"sharp-{name}"
        out.save(dest, "PNG", optimize=True)
        # replace original with sharpened (keep a raw copy once)
        raw = OG / f"raw-{name}"
        if not raw.exists():
            im.save(raw)
        out.save(p, "PNG", optimize=True)
        print("sharpened", name, out.size)


def main():
    OG.mkdir(parents=True, exist_ok=True)
    sharpen_ogs()
    bake_duelyst("f1_general", "lyonar", "Lyonar General", 5, 2, 25, OG / "face-lyonar.png")
    bake_duelyst("f2_general", "songhai", "Songhai General", 5, 2, 25, OG / "face-songhai.png")
    bake_duelyst("f5_general", "magmar", "Magmar General", 5, 3, 14, OG / "face-magmar.png")
    bake_gw("arcane-archer", "Arcane Archer", OG / "face-archer.png")
    bake_gw("armored-axeman", "Armored Axeman", OG / "face-axe.png")
    # pack fan: three faces side by side
    faces = [Image.open(OG / n).convert("RGBA") for n in ("face-lyonar.png", "face-songhai.png", "face-archer.png")]
    fan = Image.new("RGBA", (980, 620), (10, 8, 16, 255))
    xs = (40, 310, 580)
    for i, im in enumerate(faces):
        im = im.resize((280, 408), Image.Resampling.NEAREST)
        fan.alpha_composite(im, (xs[i], 90 + (i - 1) * 12))
    fan.convert("RGB").save(OG / "pack-fan.png", "PNG", optimize=True)
    print("pack-fan", fan.size)


if __name__ == "__main__":
    main()
