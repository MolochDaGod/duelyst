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

## Local lab

```
PORT=8766 node lab/server.mjs
```

http://127.0.0.1:8766/rpg-maker-studio

Packed sheets stay on disk at `D:\Games\Models\_extract\duelyst\Duelyst-Sprites\` (not in git). Production loads them from CDN.

## Bake + deploy

```
node lab/tools/bake-duelyst-site.mjs
npx vercel --prod --yes --scope grudgenexus
```

Bake writes `catalog/duelyst-index.json` from plist clip names + `lab/clash-abilities.mjs`.
