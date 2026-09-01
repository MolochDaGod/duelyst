"""Find the interior transparent art window of each TCG frame (largest interior blob)."""
import glob
import json
import os
from collections import deque

from PIL import Image

out = {}
for f in sorted(glob.glob("tcg-chrome/frames/*.png")):
    fac = os.path.splitext(os.path.basename(f))[0]
    im = Image.open(f).convert("RGBA")
    w, h = im.size
    px = im.load()
    seen = [[False] * w for _ in range(h)]
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if px[x, y][3] < 16 and not seen[y][x]:
                seen[y][x] = True
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if px[x, y][3] < 16 and not seen[y][x]:
                seen[y][x] = True
                q.append((x, y))
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and px[nx, ny][3] < 16:
                seen[ny][nx] = True
                q.append((nx, ny))

    best = None
    for sy in range(h):
        for sx in range(w):
            if seen[sy][sx] or px[sx, sy][3] >= 16:
                continue
            q = deque([(sx, sy)])
            seen[sy][sx] = True
            minx = maxx = sx
            miny = maxy = sy
            n = 0
            while q:
                x, y = q.popleft()
                n += 1
                minx = min(minx, x)
                maxx = max(maxx, x)
                miny = min(miny, y)
                maxy = max(maxy, y)
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and px[nx, ny][3] < 16:
                        seen[ny][nx] = True
                        q.append((nx, ny))
            # ignore specks; union every real interior hole so nothing is left bare
            if n < 40:
                continue
            if best is None:
                best = [minx, miny, maxx, maxy]
            else:
                best = [min(best[0], minx), min(best[1], miny),
                        max(best[2], maxx), max(best[3], maxy)]
    x, y, mx, my = best
    out[fac] = {"x": x, "y": y, "w": mx - x + 1, "h": my - y + 1}
    print(fac, out[fac])

print(json.dumps(out))
