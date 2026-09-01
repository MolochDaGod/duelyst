# Duelyst Codex

Live: **https://duelyst.grudge-studio.com**

Vercel project `duelyst` (alias `duelyst-seven.vercel.app`). Edge host is Worker `duelyst-codex-proxy`.

Open Duelyst CC0 unit sprites. **Not** Nexus Nemesis. **Not** a player bag — ownership stays Railway `user_cards`. Commander is the NFT on the castle.

## Stores

| Layer | Where |
|-------|--------|
| Codex SPA | this repo → Vercel |
| Binaries | R2 `grudge-assets` `sprites/duelyst/units|plists|tcg-chrome|index.json` → `assets.grudge-studio.com` |
| D1 index | ObjectStore `assets` id `sprites-duelyst-index` (not bag) |
| Card registry | ObjectStore D1 `grudge-objectstore`: `grudge_cards`, `grudge_card_art`, `grudge_card_clips` (not bag) |

## Card sets

| Tab | What it is |
|-----|------------|
| **Duelyst** | 637 open CC0 units — the player-side sprite library |
| **Dopebudz PVE** | 72 THC Labz Season 1 cards: the **AI opponents** fought in the `dopebudz.*` city PVE challenges — 12 cities × 5 goons + 1 city boss battle. Not player mints |
| **GrudaWars** | 86 CraftPix hero strips |
| **BadBudz** | 59 THC Labz custom battle cards — the Magmar roster re-skinned (see below) |

Season 1 cards wear the THC Labz cannabis chrome instead of the Duelyst frames:
the leaf frame for the 12 city bosses, gold for the goons
(`tcg-chrome/frames/thc-*.png`, geometry under `thc` in `LAYOUT.json`).
The registry tags them `useCase: "pve-opponent"`, `game: "dopebudz"` and
`encounter: "city-boss-battle" | "city-challenge"`.

## BadBudz (THC Labz custom set)

The Magmar faction is presented as **BadBudz**. The sprites are the same Duelyst
sheets — only the presentation layer changes, so those units move out of the
Duelyst tab rather than appearing twice:

- **Names** are strain-themed and minted deterministically from the unit id
  (`Kief Godfather the Gassed`, `Chronic Enforcer`, `Blunt Grinder`), so a
  rebuild never reshuffles them.
- **Rarity is the strain ladder**: Regz → Sour Diesel → Sour D Purple →
  Purple Haze → Runtz. Generals sit at the top; the rest roll on weight.
- **Abilities** re-present the Duelyst keywords in THC language — melee is
  *Hand-to-Hand*, tank is *Couchlock*, splash is *Second-Hand*, spell is
  *Lab Grade*.
- **Chrome** per tier: a dark strain-tinted scene base (CO2 lab / THC banner /
  DopeBudz sign), a full-window **bud wallpaper** from that strain **panning
  slowly** behind the sprite at ~16% opacity, the THC Labz star in the card's
  top-left, and the leaf frame for the loudest two tiers.

Card chrome is built from the brand art in `tcg-chrome/thc/_src/`:

```
python lab/tools/build-badbudz-chrome.py   # backgrounds + bud wallpaper + logo
node   lab/tools/build-badbudz.mjs         # names, rarity, abilities -> catalog/badbudz.json
```

`buds-<tier>.png` is a **wallpaper**, not a band. The strain banner is one row
of buds with dead space above it; tiling that as a band could only cover a strip
of the art window, which cut the card in half with a hard horizontal edge and
buried the sprite. The builder trims the row to its buds and re-stacks it at a
heavy overlap so the buds interlock into a solid field, then mirror-tiles the
result (`[A | mirror(A)]`) so the pan wraps with no seam in either direction. A
build-time gate rejects any wall whose thinnest scanline drops below 60% cover —
that would be a dead stripe.

The card renderer draws it at the full height of the art window, phases the pan
per card id (a shared phase made every card show the same bud in the same place)
and snaps the offset to whole device pixels, since panning a bitmap by a
fraction of a pixel resamples it every frame — that shimmers on screen and makes
every exported animation frame differ everywhere.

## Grudge card UUIDs

Every card in the game — 696 Duelyst units, 72 Season 1 city PVE cards, 86
GrudaWars heroes (**854** total) — has one canonical id:

```
CARD-<epoch>-<seqHex>-<md5:8>     e.g. CARD-20260901000000-000048-88D29B62
```

Same convention as `weapon_prefabs` `ITEM-…`. The md5 hashes the stable
*source key* (`duelyst:<id>`, `season1:<city>:<id>`, `grudawars:<id>`), so a
rebuild never rotates an existing id. `UUID_EPOCH` in
`lab/tools/build-card-registry.mjs` is frozen — changing it re-mints everything.

The registry also carries every art asset (**5 404** rows: sheet, plist,
portrait, frame, background, per-clip images, and the slash/burst/projectile
VFX sprites) and every animation (**4 882** clips / **55 440** frames, with
loop flags and sheet rects read straight from the source TexturePacker plists).

## How a sprite is fitted and resampled

Two things decide how a unit reads inside its card art window:

**Size comes from measured ink, not the declared rect.** Plist frame rects carry
a lot of empty padding — the rect is the animation's full stage, not the
character — so fitting art to it left every sprite small and floating. The
renderer measures the union of non-transparent pixels across *all* frames of a
clip (one composite + one readback, cached), then crops every frame to that
shared window. Per-frame ink boxes would make the sprite pulse and hop as the
animation played; the shared window lets it fill the box *and* still move.

**Cleanliness comes from Scale2x, not from smoothing.** A fractional
nearest-neighbour blit makes some source pixels two device pixels wide and
others one, which is what reads as a ragged sprite; a plain bilinear upscale
just blurs it. Frames are blown up by Scale2x/EPX instead (one pass past 1.5×,
two past 3×) — it resolves diagonal staircases into clean 45° steps and leaves
flat colour and hard edges alone — then smooth-downscaled onto the exact target
size. Blow-ups are memoised in a bounded LRU, so one pass of an animation warms
the cache and the rest is free.

Stat numerals get the same treatment: they are composed into a scratch buffer at
**device** resolution rather than card resolution, because building a ~20px
numeral in card units and letting the card transform magnify it was what left
the digits ragged with a broken outline.

## Card API

Live on `https://objectstore.grudge-studio.com` (Worker `grudgeassets`), read-only:

| Endpoint | Returns |
|----------|---------|
| `GET /v1/cards` | filter by `source`, `faction`, `role`, `kind`, `rarity`, `clip`, `q`; page with `limit`/`offset`; expand with `art=1`, `clips=1` |
| `GET /v1/cards/:ref` | one card by Grudge UUID, source key, or slug — includes art + clips |
| `GET /v1/cards/:ref/art` | every image/sheet/plist/VFX asset for that card |
| `GET /v1/cards/:ref/clips` | every animation with frame counts and sheet rects |
| `GET /v1/cards/stats` | totals by source and faction, plus clip/frame totals |
| `GET /v1/cards/factions` | facet counts — also `/sources`, `/roles`, `/clips` |

Static mirrors ship with the site: `/api/v1/cards`, `/api/v1/art`,
`/api/v1/clips`, `/api/v1/vfx`, `/api/v1/cards-by-uuid`.

## Local lab

```
PORT=8766 node lab/server.mjs
```

http://127.0.0.1:8766/rpg-maker-studio

Or serve the repo exactly as Vercel does (proxies the CDN, so sprites load):

```
node lab/tools/preview.mjs        # http://127.0.0.1:8788
```

Packed sheets stay on disk at `D:\Games\Models\_extract\duelyst\Duelyst-Sprites\` (not in git). Production loads them from CDN.

## Bake + deploy

```
node lab/tools/bake-duelyst-site.mjs
npx vercel --prod --yes --scope grudgenexus
```

Bake writes `catalog/duelyst-index.json` from plist clip names +
`lab/clash-abilities.mjs`, then chains `build-clip-index.mjs` (per-clip frames
and VFX sprites, needs the extracted source) and `build-card-registry.mjs`
(UUIDs, art index, API payloads, and the D1 seed).

Push the registry to D1 and redeploy the API worker:

```
cd ../ObjectStore
npx wrangler d1 execute grudge-objectstore --remote --file=workers/seed/grudge-cards.sql
npx wrangler deploy
```

## Verification gates

Re-run these after touching layout, the registry, or the worker:

| Tool | Checks |
|------|--------|
| `python lab/tools/verify-card-bg.py` | background art fully covers the art window on every frame × backdrop combination (10 Duelyst + 2 THC + 12 cities × 2), 0 uncovered px |
| `node lab/tools/verify-art-urls.mjs` | every art URL really serves image/plist bytes — catches R2 objects that return a 200 HTML error page under a `.png` key |
| `node lab/tools/repair-art-r2.mjs` | re-uploads any such corrupt object from the local source and purges the CDN cache |
| `node lab/tools/audit-clip-coverage.mjs` | shipped clip lists match the source plists + Unity `.anim` clips |
| `python lab/tools/verify-card-seed.py <seed>` | the D1 seed loads, with no orphan/duplicate/badly-linked rows |
| `node lab/tools/test-card-api.mjs` | drives the real worker over a SQLite shim (37 assertions) |
| `node lab/tools/verify-card-art-unique.mjs` | flags cards that ship byte-identical artwork |

### Duplicate portrait art

`verify-card-art-unique.mjs` reports **7 duplicate portrait pairs** in the
Season 1 set — 14 cards sharing 7 images (e.g. *Chronos the Hash Specter* and
*Solara the Sungrown Sentinel*). The duplication is in the **source art on R2**,
not in the wiring: each card points at its own correctly-named file, and those
files happen to hold the same picture. The external `battle.thc-labz.xyz` host
404s for all 14, so there is no alternate to fall back to — only replacement
artwork fixes it at the source.

What *is* fixed: those cards no longer **render** identically. Every dopebudz
city now has its own backdrop (`tcg-chrome/cities/`, built by
`build-city-backgrounds.py`), and the one same-city pair is separated by
mirroring the backdrop on a stable hash of the card id. All seven pairs verify
as visually distinct.

## Asset build steps

These regenerate committed indexes and are chained by the bake where possible:

| Tool | Produces |
|------|----------|
| `python lab/tools/prep-thc-frames.py` | keys the white backing out of the THC frames in `tcg-chrome/frames/_src/`, resizes to 195×284, reports the art window |
| `python lab/tools/build-badbudz-chrome.py` | BadBudz strain backgrounds + mirror-tiled full-window bud wallpaper + logo from `tcg-chrome/thc/_src/` |
| `node lab/tools/build-badbudz.mjs` | `catalog/badbudz.json` — BadBudz names, rarity ladder and abilities |
| `python lab/tools/build-city-backgrounds.py` | `tcg-chrome/cities/` — one PVE backdrop per dopebudz city |
| `python lab/tools/build-gw-clip-index.py` | `catalog/grudawars-clips.json` — measured frame counts for the 542 GrudaWars strips |
| `python lab/tools/build-pve-thumbs.py` | card-sized WebP portraits for the PVE cards, uploaded to `sprites/thc-pve/card/`, plus `catalog/pve-thumbs.json` |
| `node lab/tools/build-clip-index.mjs` | `catalog/duelyst-clips.json` + `catalog/vfx-index.json` |
| `node lab/tools/build-card-registry.mjs` | `catalog/cards.json`, `api/v1/*.json`, and the D1 seed |

`catalog/cards.json`, `catalog/duelyst-clips.json`, `catalog/vfx-index.json`
and `api/v1/*.json` are generated — edit the builders, not those files.

### Gotchas

- **VFX sprites do not live on `info.grudge-studio.com`.** That host answers
  every `/sprites/**` path with its SPA shell (200 + HTML), so effects resolved
  against it decode-fail and no slash/projectile ever draws. Use the
  `sourceBase` field from `effectSprites.json`.
- **Season 1 portraits**: the external `battle.thc-labz.xyz` card art 404s for
  47 of 72 cards, and the full-res R2 mints average 1.7 MB each (122 MB for the
  set). The card-sized WebP in `sprites/thc-pve/card/` is the primary source
  (3.5 MB total); mint and the external host are fallbacks.
- **GrudaWars strips are not always square-celled.** Guessing
  `round(width / min(w,h))` mis-slices 141 of 542 strips into fractional frame
  widths. Use the measured counts in `catalog/grudawars-clips.json`.
- **Faction counts are derived from the units**, never a hand-kept map — the old
  one drifted to `other: 2` for what are really `critter` units and rendered a
  dead filter chip.
- **The uploader skips keys that already exist**, so a corrupt object never
  self-heals — that is what `repair-art-r2.mjs` is for.

