# GameWithAll Battle DAO — `gwa.grudge-studio.com`

Launch page + card directory + pack API. **Not a player bag.**

| Layer | Store |
|-------|--------|
| This Worker | HTML launch, `/api/directory`, `/api/info`, pack preview |
| Codex | `duelyst.grudge-studio.com` catalogs |
| Ownership | Dope-Budz Railway `user_cards` via `gamewithall-pack` |
| Play | `thc-labz-battle.vercel.app/library` |
| Wallet | Grudge ID + `wallet.grudge-studio.com` + Phantom |
| Mint pad | https://www.orbisonsol.io/launch (cNFT application) |
| **Whitelist** | **0.5 SOL** → fleet treasury `CLbdnF3…` → Railway `POST /api/characters` era=`warlords` + `POST /api/nfts/mint` |
| MMO access | `characterId` handoff to `grudgewarlords.com` / Foundry |
| Look | Codex card chrome (`tcg-chrome`) + screenshots in `public/og/` + Grudge Studio logos |

```bash
cd gwa-launch
npx wrangler deploy
```
