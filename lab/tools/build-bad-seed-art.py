"""Build the Bad Seed hero portrait from the f5_egg sprite sheet.

`tcg-chrome/thc/bad-seed.png` was mistakenly created as a byte-identical copy of
the THC logo mark, so the /badbudz hero and the Battle library incubator both
rendered the logo instead of the seed. The card canvas was never affected — it
draws the live f5_egg sprite — this only fixes the standalone hero art.

Pulls the sprite sheet + plist off R2, picks the largest idle frame, trims it to
its alpha bounds, upscales with nearest-neighbour so the pixel art stays crisp,
and warms it toward the BadBudz green with a soft glow behind the seed.

Run: python lab/tools/build-bad-seed-art.py
"""
import io
import pathlib
import plistlib
import re
import urllib.request

import numpy as np
from PIL import Image, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "tcg-chrome" / "thc" / "bad-seed.png"

BASE = "https://assets.grudge-studio.com/sprites/duelyst"
SHEET_URL = f"{BASE}/units/f5_egg.png"
PLIST_URL = f"{BASE}/plists/f5_egg.plist"

TARGET = 512  # hero art is displayed at ~100-160px; 512 keeps it crisp on retina


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "grudge-codex/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def parse_pair(text):
    nums = [int(round(float(n))) for n in re.findall(r"-?\d+(?:\.\d+)?", text)]
    return nums


def frames_from_plist(raw):
    """Yield (name, x, y, w, h, rotated) for every frame in the plist."""
    data = plistlib.loads(raw)
    out = []
    for name, meta in data.get("frames", {}).items():
        if "frame" in meta:  # format 2/3
            x, y, w, h = parse_pair(meta["frame"])
            rotated = bool(meta.get("rotated", False))
        elif "textureRect" in meta:
            x, y, w, h = parse_pair(meta["textureRect"])
            rotated = bool(meta.get("textureRotated", False))
        else:
            continue
        out.append((name, x, y, w, h, rotated))
    return out


def main():
    sheet = Image.open(io.BytesIO(fetch(SHEET_URL))).convert("RGBA")
    frames = frames_from_plist(fetch(PLIST_URL))
    if not frames:
        raise SystemExit("no frames parsed from f5_egg.plist")

    idle = [f for f in frames if "idle" in f[0].lower()] or frames
    print(f"sheet={sheet.size} frames={len(frames)} idle={len(idle)}")

    best = None
    for name, x, y, w, h, rotated in idle:
        box = (x, y, x + (h if rotated else w), y + (w if rotated else h))
        cell = sheet.crop(box)
        if rotated:
            cell = cell.rotate(-90, expand=True)
        bbox = cell.getbbox()
        if not bbox:
            continue
        cell = cell.crop(bbox)
        # score by opaque pixel count so we take the fullest pose, not an empty
        # or mid-blink frame
        score = int((np.array(cell)[:, :, 3] > 8).sum())
        if best is None or score > best[0]:
            best = (score, name, cell)

    if best is None:
        raise SystemExit("every idle frame was fully transparent")

    score, name, cell = best
    print(f"picked {name} {cell.size} opaque={score}")

    # Upscale nearest-neighbour: the source is small pixel art, so a smooth
    # resample would turn it to mush.
    scale = max(1, TARGET // max(cell.size))
    art = cell.resize((cell.width * scale, cell.height * scale), Image.NEAREST)

    # Weedify: the source egg is blue/teal, so simply lifting green leaves it
    # cyan. Cut blue hard and lift red a little to land on a warm cannabis
    # green, then re-seat the darkest pixels so the shading does not go flat.
    px = np.array(art).astype(np.float32)
    rgb, alpha = px[:, :, :3], px[:, :, 3:]
    lum = rgb.mean(axis=2, keepdims=True) / 255.0

    warm = np.concatenate(
        [
            rgb[:, :, 0:1] * 0.55 + 60.0 * lum,
            rgb[:, :, 1:2] * 1.06 + 26.0 * lum,
            rgb[:, :, 2:3] * 0.34,
        ],
        axis=2,
    )
    art = Image.fromarray(
        np.concatenate([np.clip(warm, 0, 255), alpha], axis=2).astype(np.uint8), "RGBA"
    )

    # Soft green glow behind the seed so it reads on the dark studio panel.
    pad = max(16, art.width // 8)
    canvas = Image.new("RGBA", (art.width + pad * 2, art.height + pad * 2), (0, 0, 0, 0))
    glow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    silhouette = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    silhouette.paste(Image.new("RGBA", art.size, (82, 220, 61, 255)), (pad, pad), art)
    glow = silhouette.filter(ImageFilter.GaussianBlur(pad * 0.55))
    glow.putalpha(glow.getchannel("A").point(lambda a: int(a * 0.55)))

    canvas = Image.alpha_composite(canvas, glow)
    canvas.paste(art, (pad, pad), art)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(OUT, optimize=True)
    print(f"wrote {OUT.relative_to(ROOT)} {canvas.size} {OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
