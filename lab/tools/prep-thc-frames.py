"""Prepare the THC Labz Season 1 frames for the Codex card canvas.

The supplied art is fully opaque: the art window and the area outside the
rounded card are painted pure white rather than left transparent, so dropping it
straight onto a card would hide the sprite behind a white slab.

This keys out only the white that is *connected* to the art window and to the
outer corners (flood fill from seeds), which preserves the white specular
highlights on the gold bevel, then resizes to the 195x284 card canvas and
reports the resulting art window.

Run: python lab/tools/prep-thc-frames.py
"""
import collections
import json
import pathlib
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
FRAMES = ROOT / "tcg-chrome" / "frames"
CARD_W, CARD_H = 195, 284
WHITE = 244  # every channel at or above this counts as "backing white"
SHADOW_MIN = 60  # neutral greys this bright are the frame's baked-in shadow

SOURCES = {
    "thc-epic-gold.png": "_src/thc-epic-gold.png",
    "thc-legendary-weed.png": "_src/thc-legendary-weed.png",
}


def key_white(img):
    """Recover the true alpha of the art window.

    The source was flattened onto white, so two things live in the window:
    pure white backing (should become fully transparent) and the neutral-grey
    shadow the frame's inner lip casts onto the card (should become *black at
    partial alpha*, not a pale grey band). Flood from the corners and the window
    centre through both, un-compositing the grey as it goes.
    """
    w, h = img.size
    px = img.load()

    def kind(x, y):
        r, g, b, _ = px[x, y]
        if r >= WHITE and g >= WHITE and b >= WHITE:
            return "white"
        # The frame art is strongly tinted (gold / green); only the baked-in
        # shadow is neutral, so a tight spread is a safe test.
        if max(r, g, b) - min(r, g, b) <= 14 and min(r, g, b) >= SHADOW_MIN:
            return "shadow"
        return None

    seeds = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, h // 2)]
    seen = [[False] * w for _ in range(h)]
    dq = collections.deque()
    for sx, sy in seeds:
        if kind(sx, sy) and not seen[sy][sx]:
            seen[sy][sx] = True
            dq.append((sx, sy))

    cleared = shadows = 0
    while dq:
        x, y = dq.popleft()
        k = kind(x, y)
        if k == "shadow":
            r, g, b, _ = px[x, y]
            lum = (r + g + b) / 3
            # grey-on-white == black at (255 - lum) alpha
            px[x, y] = (0, 0, 0, max(0, min(255, int(round(255 - lum)))))
            shadows += 1
        else:
            px[x, y] = (255, 255, 255, 0)
            cleared += 1
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and kind(nx, ny):
                seen[ny][nx] = True
                dq.append((nx, ny))
    return cleared, shadows


def interior_blobs(img, min_px=60):
    """Transparent regions that do not touch the border — the real windows."""
    w, h = img.size
    a = img.getchannel("A").load()
    clear = [[a[x, y] < 24 for x in range(w)] for y in range(h)]

    outside = [[False] * w for _ in range(h)]
    dq = collections.deque()
    edge = [(x, y) for x in range(w) for y in (0, h - 1)]
    edge += [(x, y) for y in range(h) for x in (0, w - 1)]
    for x, y in edge:
        if clear[y][x] and not outside[y][x]:
            outside[y][x] = True
            dq.append((x, y))
    while dq:
        x, y = dq.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and clear[ny][nx] and not outside[ny][nx]:
                outside[ny][nx] = True
                dq.append((nx, ny))

    seen = [[False] * w for _ in range(h)]
    blobs = []
    for y in range(h):
        for x in range(w):
            if not clear[y][x] or outside[y][x] or seen[y][x]:
                continue
            q = collections.deque([(x, y)])
            seen[y][x] = True
            pts = []
            while q:
                cx, cy = q.popleft()
                pts.append((cx, cy))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = cx + dx, cy + dy
                    if (0 <= nx < w and 0 <= ny < h and clear[ny][nx]
                            and not outside[ny][nx] and not seen[ny][nx]):
                        seen[ny][nx] = True
                        q.append((nx, ny))
            if len(pts) < min_px:
                continue
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            blobs.append({"x": min(xs), "y": min(ys),
                          "w": max(xs) - min(xs) + 1, "h": max(ys) - min(ys) + 1,
                          "px": len(pts)})
    blobs.sort(key=lambda b: -b["px"])
    return blobs


def main():
    out = {}
    for dest, src_rel in SOURCES.items():
        src = FRAMES / src_rel
        if not src.exists():
            print(f"missing source {src} — keep the originals in tcg-chrome/frames/_src/")
            return 1
        img = Image.open(src).convert("RGBA")
        cleared, shadows = key_white(img)
        card = img.resize((CARD_W, CARD_H), Image.LANCZOS)
        card.save(FRAMES / dest)
        blobs = interior_blobs(card)
        print(f"\n{dest}  {img.size} -> {CARD_W}x{CARD_H}  keyed {cleared} px, shadow recovered {shadows}")
        for b in blobs:
            print(f"   hole x={b['x']:<4} y={b['y']:<4} w={b['w']:<4} h={b['h']:<4} px={b['px']}")
        if blobs:
            a = blobs[0]
            out[dest] = {"x": a["x"], "y": a["y"], "w": a["w"], "h": a["h"]}
            print(f"   -> art {json.dumps(out[dest])}")
    (pathlib.Path(__file__).parent / "thc-frame-windows.json").write_text(
        json.dumps(out, indent=1), encoding="utf8")
    print("\n-> lab/tools/thc-frame-windows.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
