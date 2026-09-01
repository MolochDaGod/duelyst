"""Detect real frame counts in GrudaWars CraftPix sprite strips.

The Codex used to guess frames as `round(width / min(width, height))`, which
assumes square cells. 64 of 542 strips are not square, so that guess produced
fractional frame widths (e.g. 1848x190 -> 184.8px) and every frame after the
first was drawn misaligned.

This measures the strip instead: for each candidate frame count that divides the
width evenly, score how well the alpha profile repeats with that period, and
prefer the tightest repeat whose cell is closest to a sensible aspect. Output is
committed so the site never has to guess.

Run: python lab/tools/build-gw-clip-index.py
"""
import io
import json
import pathlib
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
CATALOG = ROOT / "catalog" / "catalog.json"
OUT = ROOT / "catalog" / "grudawars-clips.json"


def divisors(n, lo=1, hi=None):
    hi = hi or n
    return [d for d in range(lo, hi + 1) if n % d == 0]


def column_alpha(img):
    """Sum of alpha per column — the shape signature of the strip."""
    a = img.getchannel("A")
    w, h = a.size
    px = a.load()
    return [sum(px[x, y] for y in range(h)) for x in range(w)]


def score_period(profile, period):
    """Mean absolute difference between successive repeats; lower is better."""
    n = len(profile) // period
    if n < 2:
        return float("inf")
    total = 0.0
    count = 0
    for i in range(period):
        vals = [profile[i + k * period] for k in range(n)]
        mean = sum(vals) / len(vals)
        total += sum(abs(v - mean) for v in vals)
        count += len(vals)
    return total / max(count, 1)


def detect(img):
    w, h = img.size
    profile = column_alpha(img)
    scale = max(max(profile), 1)
    profile = [p / scale for p in profile]

    # Fully transparent gutter columns are the strongest signal when present.
    blank = [x for x, v in enumerate(profile) if v <= 0.001]

    best = None
    # Frame must be at least 1/4 of the height and no wider than 4x the height.
    for count in divisors(w):
        fw = w // count
        if fw < max(4, h // 4) or fw > h * 4:
            continue
        s = score_period(profile, fw)
        # Prefer cells close to square, but only as a tie-breaker.
        aspect_penalty = abs(fw - h) / max(h, 1) * 0.02
        # Reward splits that land on blank gutters.
        edges = sum(1 for k in range(1, count) if (k * fw) in blank or (k * fw - 1) in blank)
        gutter_bonus = -0.05 * (edges / max(count - 1, 1))
        total = s + aspect_penalty + gutter_bonus
        if best is None or total < best[0]:
            best = (total, count, fw)

    if best is None:
        return {"frames": 1, "fw": w, "fh": h, "method": "fallback"}
    _, count, fw = best
    return {"frames": count, "fw": fw, "fh": h, "method": "profile"}


def fetch(url):
    # The CDN rejects urllib's default agent with a 403. Spaces in keys (e.g.
    # "Take Hit.png") must be percent-encoded or urllib refuses the request.
    safe = urllib.parse.quote(url, safe=":/?#[]@!$&'()*+,;=%~")
    req = urllib.request.Request(safe, headers={"User-Agent": "grudge-codex-tools/1.0"})
    last = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return Image.open(io.BytesIO(r.read())).convert("RGBA")
        except Exception as e:  # noqa: BLE001 — transient DNS/socket errors are common here
            last = e
            time.sleep(1.5 * (attempt + 1))
    raise last


def main():
    cat = json.loads(CATALOG.read_text(encoding="utf8"))
    heroes = cat.get("heroes", [])
    jobs = [(h["id"], clip, url)
            for h in heroes
            for clip, url in (h.get("clips") or {}).items()]
    print(f"clip strips: {len(jobs)}")

    out = {}
    done = 0

    def work(job):
        hid, clip, url = job
        try:
            img = fetch(url)
        except Exception as e:  # noqa: BLE001
            return hid, clip, {"error": str(e)}
        d = detect(img)
        d["w"], d["h"] = img.size
        return hid, clip, d

    with ThreadPoolExecutor(max_workers=12) as pool:
        for hid, clip, d in pool.map(work, jobs):
            out.setdefault(hid, {})[clip] = d
            done += 1
            if done % 50 == 0:
                print(f"  {done}/{len(jobs)}", flush=True)

    errors = sum(1 for h in out.values() for d in h.values() if "error" in d)
    total = sum(d.get("frames", 0) for h in out.values() for d in h.values())
    # How many the old square-cell guess got wrong.
    fixed = 0
    for h in out.values():
        for d in h.values():
            if "error" in d:
                continue
            w, ht = d["w"], d["h"]
            cell = min(w, ht)
            cols = max(1, round(w / cell)) if w >= ht else 1
            if cols != d["frames"]:
                fixed += 1

    OUT.write_text(json.dumps({
        "heroes": len(out),
        "strips": len(jobs),
        "frameTotal": total,
        "correctedVsSquareGuess": fixed,
        "units": out,
    }), encoding="utf8")
    print(f"heroes {len(out)}  strips {len(jobs)}  frames {total}")
    print(f"corrected vs old square guess: {fixed}")
    print(f"errors: {errors}")
    print(f"-> {OUT.relative_to(ROOT)}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
