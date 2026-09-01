"""Generate card-sized thumbnails for the dopebudz PVE portraits.

The mint portraits on R2 average 1.7 MB (122.7 MB across the 72 cards), so the
Codex grid had to pull a third of a gigabyte to draw 72 thumbnails. The card art
window is only ~166x156, so nothing above ~512px is ever visible.

Downscales each portrait, writes WebP (alpha preserved), uploads to
sprites/thc-pve/card/<slug>.webp, and records the mapping so the catalog and
registry can point at the small copy first.

  python lab/tools/build-pve-thumbs.py --dry-run
  python lab/tools/build-pve-thumbs.py
"""
import io
import json
import pathlib
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
CATALOG = ROOT / "catalog" / "catalog.json"
OUT_DIR = ROOT / "lab" / "tools" / "_thumbs"
MAP_FILE = ROOT / "catalog" / "pve-thumbs.json"
CDN = "https://assets.grudge-studio.com"
PREFIX = "sprites/thc-pve/card"
MAX_EDGE = 512
QUALITY = 86

DRY = "--dry-run" in sys.argv


def fetch(url):
    safe = urllib.parse.quote(url, safe=":/?#[]@!$&'()*+,;=%~")
    req = urllib.request.Request(safe, headers={"User-Agent": "grudge-codex-tools/1.0"})
    last = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.5 * (attempt + 1))
    raise last


def main():
    cat = json.loads(CATALOG.read_text(encoding="utf8"))
    cards = cat.get("cards", [])
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    results = {}
    stats = {"src": 0, "out": 0}

    def work(c):
        url = c.get("mintImage") or c.get("image")
        if not url:
            return None
        slug = pathlib.Path(urllib.parse.urlparse(url).path).stem
        try:
            raw = fetch(url)
        except Exception as e:  # noqa: BLE001
            print(f"  FAIL {c['name']}: {e}")
            return None
        img = Image.open(io.BytesIO(raw)).convert("RGBA")
        w, h = img.size
        scale = min(1.0, MAX_EDGE / max(w, h))
        if scale < 1.0:
            img = img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, "WEBP", quality=QUALITY, method=6)
        data = buf.getvalue()
        (OUT_DIR / f"{slug}.webp").write_bytes(data)
        return {"id": c["id"], "slug": slug, "src": len(raw), "out": len(data),
                "size": img.size, "orig": (w, h)}

    with ThreadPoolExecutor(max_workers=8) as pool:
        for r in pool.map(work, cards):
            if not r:
                continue
            stats["src"] += r["src"]
            stats["out"] += r["out"]
            results[r["id"]] = f"{CDN}/{PREFIX}/{r['slug']}.webp"

    print(f"thumbs {len(results)}/{len(cards)}")
    print(f"source {stats['src']/1048576:.1f} MB -> thumbs {stats['out']/1048576:.1f} MB "
          f"({stats['out']/max(stats['src'],1)*100:.1f}%)")

    if DRY:
        print("dry run — nothing uploaded")
        return 0

    MAP_FILE.write_text(json.dumps({
        "note": "card-sized dopebudz PVE portraits; full-res mint stays on R2",
        "cdn": CDN, "prefix": PREFIX, "maxEdge": MAX_EDGE,
        "byCardId": results,
    }), encoding="utf8")
    print(f"-> {MAP_FILE.relative_to(ROOT)}")

    # Upload via the existing SigV4 helper (same path the other R2 tools use).
    up = ROOT / "lab" / "tools" / "_upload_thumbs.mjs"
    up.write_text(
        'import fs from "node:fs";\n'
        'import path from "node:path";\n'
        'import { pathToFileURL } from "node:url";\n'
        'const { putR2Object } = await import(pathToFileURL("F:/GitHub/ObjectStore/scripts/lib/r2-s3-sigv4.mjs").href);\n'
        f'const dir = {json.dumps(str(OUT_DIR))};\n'
        f'const prefix = {json.dumps(PREFIX)};\n'
        'const files = fs.readdirSync(dir).filter((f) => f.endsWith(".webp"));\n'
        'let n = 0;\n'
        'for (const f of files) {\n'
        '  const body = fs.readFileSync(path.join(dir, f));\n'
        '  await putR2Object({ key: `${prefix}/${f}`, body, contentType: "image/webp" });\n'
        '  if (++n % 10 === 0) console.log(`  ${n}/${files.length}`);\n'
        '}\n'
        'console.log("uploaded", n);\n',
        encoding="utf8")
    print("uploading to R2…")
    subprocess.run(["node", str(up)], check=True, cwd=str(ROOT))
    up.unlink(missing_ok=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
