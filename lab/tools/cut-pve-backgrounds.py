"""Cut the flat grey studio background out of the dopebudz PVE portraits.

20 of the 72 Season 1 portraits were rendered on a flat grey card, so they
covered the card's own city background with a grey slab. This flood-fills that
backing from the border and writes a transparent-backed cutout.

Scene-style art (a lab interior rather than a character on a plate) is detected
by border variance and left alone — keying it would destroy the picture.

  python lab/tools/cut-pve-backgrounds.py --dry-run
  python lab/tools/cut-pve-backgrounds.py
"""
import collections
import io
import json
import pathlib
import statistics
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
CATALOG = ROOT / "catalog" / "catalog.json"
OUT_DIR = ROOT / "lab" / "tools" / "_cutouts"
MAP_FILE = ROOT / "catalog" / "pve-cutouts.json"
CDN = "https://assets.grudge-studio.com"
PREFIX = "sprites/thc-pve/cut"
MAX_EDGE = 640

# Measured on the real set: a flat studio plate reads 0.8-1.0 border stdev, the
# lab-scene portraits (the CO2 canister, the two extract jars) read 21-24. Ten
# splits them with room to spare; at the old 26 the scenes were mistaken for
# plates and the flood ate the picture.
FLAT_SPREAD = 10

# Tolerance tracks how dark the backing is. The plates are not all light grey —
# some are near-black (35,39,42), and a fixed wide tolerance there also matches
# the character's own black outline, so the flood leaks straight through the
# figure and hollows it out. Keying a dark plate needs a tight window.
TOL_MAX = 34
TOL_MIN = 8
TOL_OF_LUM = 0.28

# If keying clears almost the whole frame it did not find a backing, it
# dissolved the subject. Skip rather than publish a ruined cutout.
MAX_CLEARED = 0.92

DRY = "--dry-run" in sys.argv


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


def border_samples(img, step=6):
    w, h = img.size
    px = img.load()
    pts = []
    for x in range(0, w, step):
        pts.append(px[x, 0])
        pts.append(px[x, h - 1])
    for y in range(0, h, step):
        pts.append(px[0, y])
        pts.append(px[w - 1, y])
    return pts


def analyse(img):
    """(is_flat_plate, backing_rgb, opaque_border_fraction)."""
    pts = border_samples(img)
    opaque = [p for p in pts if p[3] > 200]
    frac = len(opaque) / max(len(pts), 1)
    if not opaque:
        return False, None, frac
    med = tuple(int(statistics.median([p[i] for p in opaque])) for i in range(3))
    spread = statistics.pstdev([sum(p[:3]) / 3 for p in opaque]) if len(opaque) > 1 else 0.0
    return spread <= FLAT_SPREAD, med, frac


def tol_for(rgb):
    """Keying window for a backing of this colour — tighter the darker it is."""
    lum = sum(rgb) / 3
    return max(TOL_MIN, min(TOL_MAX, int(round(lum * TOL_OF_LUM))))


def key_backing(img, rgb, tol):
    """Flood the backing colour inward from every edge pixel that matches.

    Returns the fraction of the frame that was cleared, so the caller can tell a
    real key from a flood that leaked through the subject.
    """
    w, h = img.size
    px = img.load()

    def near(p):
        return (abs(p[0] - rgb[0]) <= tol and abs(p[1] - rgb[1]) <= tol
                and abs(p[2] - rgb[2]) <= tol)

    seen = bytearray(w * h)
    dq = collections.deque()
    for x in range(w):
        for y in (0, h - 1):
            i = y * w + x
            if not seen[i] and near(px[x, y]):
                seen[i] = 1
                dq.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            i = y * w + x
            if not seen[i] and near(px[x, y]):
                seen[i] = 1
                dq.append((x, y))

    cleared = 0
    while dq:
        x, y = dq.popleft()
        px[x, y] = (0, 0, 0, 0)
        cleared += 1
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h:
                i = ny * w + nx
                if not seen[i] and near(px[nx, ny]):
                    seen[i] = 1
                    dq.append((nx, ny))

    # Soften the hard key edge: any still-opaque pixel touching transparency that
    # is close to the backing colour gets partial alpha, killing the grey halo.
    for _ in range(2):
        edge = []
        for y in range(h):
            for x in range(w):
                p = px[x, y]
                if p[3] == 0:
                    continue
                if not any(0 <= x + dx < w and 0 <= y + dy < h and px[x + dx, y + dy][3] == 0
                           for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    continue
                d = max(abs(p[0] - rgb[0]), abs(p[1] - rgb[1]), abs(p[2] - rgb[2]))
                if d < tol * 2:
                    edge.append((x, y, d))
        for x, y, d in edge:
            p = px[x, y]
            px[x, y] = (p[0], p[1], p[2], int(p[3] * min(1.0, d / (tol * 2))))
    return cleared / float(w * h)


def trim(img):
    box = img.getchannel("A").getbbox()
    return img.crop(box) if box else img


def main():
    cat = json.loads(CATALOG.read_text(encoding="utf8"))
    cards = cat.get("cards", [])
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    results = {}
    stats = {"cut": 0, "already": 0, "scene": 0, "dissolved": 0}

    def work(c):
        url = c.get("mintImage") or c.get("image")
        if not url:
            return None
        slug = pathlib.Path(urllib.parse.urlparse(url).path).stem
        try:
            img = Image.open(io.BytesIO(fetch(url))).convert("RGBA")
        except Exception as e:  # noqa: BLE001
            print(f"  FAIL {c['name']}: {e}")
            return None
        flat, rgb, frac = analyse(img)
        if frac <= 0.5:
            return ("already", c, slug, None)
        if not flat:
            return ("scene", c, slug, None)
        tol = tol_for(rgb)
        keyed = img.copy()
        cleared = key_backing(keyed, rgb, tol)
        if cleared > MAX_CLEARED:
            # Leaked through the subject — try once more with a tighter window.
            keyed = img.copy()
            cleared = key_backing(keyed, rgb, max(TOL_MIN, tol // 2))
        if cleared > MAX_CLEARED:
            return ("dissolved", c, slug, cleared)
        img = trim(keyed)
        img.thumbnail((MAX_EDGE, MAX_EDGE), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, "WEBP", quality=90, method=6)
        (OUT_DIR / f"{slug}.webp").write_bytes(buf.getvalue())
        return ("cut", c, slug, len(buf.getvalue()))

    with ThreadPoolExecutor(max_workers=6) as pool:
        for r in pool.map(work, cards):
            if not r:
                continue
            kind, c, slug, size = r
            stats[kind] += 1
            if kind == "cut":
                results[c["id"]] = f"{CDN}/{PREFIX}/{slug}.webp"
                print(f"  cut  {c['name']:<32} -> {size/1024:.0f} KB")
            elif kind == "scene":
                print(f"  keep {c['name']:<32} (scene art, not a plate)")
            elif kind == "dissolved":
                print(f"  SKIP {c['name']:<32} (key cleared {size:.0%} — no usable backing)")

    print(f"\nalready transparent {stats['already']}")
    print(f"scene art kept      {stats['scene']}")
    print(f"skipped (dissolved) {stats['dissolved']}")
    print(f"backgrounds cut     {stats['cut']}")

    if DRY:
        print("dry run — nothing uploaded")
        return 0
    if not results:
        print("nothing to upload")
        return 0

    MAP_FILE.write_text(json.dumps({
        "note": "PVE portraits with the flat grey studio plate keyed out",
        "cdn": CDN, "prefix": PREFIX, "byCardId": results,
    }), encoding="utf8")
    print(f"-> {MAP_FILE.relative_to(ROOT)}")

    up = ROOT / "lab" / "tools" / "_upload_cut.mjs"
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
