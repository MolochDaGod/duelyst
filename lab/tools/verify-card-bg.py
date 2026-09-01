"""Composite check: does the background fully cover the frame's art window?

Covers both chrome sets: the per-faction Duelyst frames and the THC Labz
Season 1 frames, which share one background and carry their own art windows.
"""
import glob
import json
import os

from PIL import Image

L = json.load(open("tcg-chrome/LAYOUT.json"))
bleed = L.get("artBleed", 2)
os.makedirs("screenshots", exist_ok=True)
fails = []

# (label, frame path, background path, art window)
targets = []
for f in sorted(glob.glob("tcg-chrome/frames/*.png")):
    fac = os.path.splitext(os.path.basename(f))[0]
    bg = f"tcg-chrome/backgrounds/{fac}.png"
    if os.path.exists(bg):
        targets.append((fac, f, bg, L["factionArt"].get(fac, L["art"])))

thc = L.get("thc") or {}
for key, spec in (thc.get("frames") or {}).items():
    targets.append((
        f"thc-{key}",
        os.path.join("tcg-chrome", spec["frame"]),
        os.path.join("tcg-chrome", thc["background"]),
        spec["art"],
    ))

# Every city backdrop has to cover the art window of both THC frames too.
city_index = "tcg-chrome/cities/index.json"
if os.path.exists(city_index):
    cities = json.load(open(city_index)).get("byCity", {})
    for city, rel in cities.items():
        for key, spec in (thc.get("frames") or {}).items():
            targets.append((
                f"{city.lower().replace(' ', '-')}-{key}",
                os.path.join("tcg-chrome", spec["frame"]),
                os.path.join("tcg-chrome", rel),
                spec["art"],
            ))

for label, fpath, bgpath, art in targets:
    frame = Image.open(fpath).convert("RGBA")
    bg = Image.open(bgpath).convert("RGBA")

    bx, by = art["x"] - bleed, art["y"] - bleed
    bw, bh = art["w"] + bleed * 2, art["h"] + bleed * 2
    s = max(bw / bg.width, bh / bg.height)
    dw, dh = round(bg.width * s), round(bg.height * s)
    scaled = bg.resize((dw, dh), Image.LANCZOS)
    window = scaled.crop((
        (dw - bw) // 2, (dh - bh) // 2,
        (dw - bw) // 2 + bw, (dh - bh) // 2 + bh,
    ))

    card = Image.new("RGBA", frame.size, (255, 0, 255, 255))  # magenta = uncovered
    card.paste(window, (bx, by))
    card.alpha_composite(frame)
    card.convert("RGB").save(f"screenshots/card-{label}.png")

    # Only the art window matters. The THC frames have rounded *outer* corners
    # that are legitimately transparent, so counting the whole canvas would
    # flag the card silhouette as a hole.
    px = card.load()
    holes = sum(
        1
        for y in range(art["y"], art["y"] + art["h"])
        for x in range(art["x"], art["x"] + art["w"])
        if px[x, y][:3] == (255, 0, 255)
    )
    print(f"{label:20s} art={art} uncovered={holes}")
    if holes:
        fails.append(label)

print("FAIL" if fails else "PASS", fails)
