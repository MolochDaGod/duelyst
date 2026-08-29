# Duelyst sprite hierarchy (this pack)

Machine index: `hierarchy.json` (696 units). Source: unit **ids + clips**, not invented Clash stats.

**This unitypackage has no mana / ATK / HP / rarity / ability text.** Those live in Open Duelyst card data (wiki / game JSON). `card-map.json` Clash numbers are lab placeholders for `arena25.html` only.

## Factions (races / design sets)

| Prefix | Faction | Count | Look |
|--------|---------|-------|------|
| `f1_` | **Lyonar** | 60 | Holy order, gold/white/blue, lions, knights, Zeal |
| `f2_` | **Songhai** | 58 | Eastern empire, crimson, blades, mobility |
| `f3_` | **Vetruvian** | 61 | Desert, **obelysks** (structures that spawn) |
| `f4_` | **Abyssian** | 58 | Shadow swarm, tokens, demons |
| `f5_` | **Magmar** | 59 | Magma beasts, **Build** grow ladders |
| `f6_` | **Vanar** | 70 | Ice, vespyr, walls |
| `neutral_` | Neutral | 277 | Mercs, tribals, golems, mechs — any deck |
| `boss_` | Gauntlet bosses | 51 | Named uniques; some are **parts** |
| `critter_` | Critter | 2 | Tiny filler |

Style of the pack: 3/4 side-front pixel units, 1-pixel outline, isolated, packed TexturePacker sheets, 20 fps. **Not** a citizen/town sim set.

## Roles (what naming actually encodes)

| Role | Count | Ids look like |
|------|-------|----------------|
| **general** | 6 | `f1_general` … `f6_general` — faction hero, **cast** clips |
| general-alt | 12 | `fN_altgeneral`, `fN_3rdgeneral` |
| general-tier2 | 12 | `fN_tier2general`, `fN_altgeneraltier2` |
| general-skin | 2 | `f1_general_skinroguelegacy`, `f2_general_skindogehai` |
| **minion** | 527 | Named units (`f1_silverguardsquire`, `f1_elyxstormblade`, …) |
| token-minion | 13 | `fN_buildminion`, Pandora keyword copies (rush/provoke/fly/…) |
| build-common / build-legendary | 11 | Immortal Vanguard **Build** ladder |
| **structure** | 8 | Vetruvian `obelysk*`, `f1_ironcliffemonument` |
| mercenary | 27 | `neutral_merc*` |
| tribal | 7 | `neutral_tribalmelee*`, `tribalranged*` |
| golem | 12 | `neutral_golem*` |
| mech-part | 6 | `neutral_mechaz0r{cannon,chassis,helm,sword,wing,super}` |
| **boss** / boss-part | 46+5 | `boss_andromeda`; Decepticle helm/sword/wings |
| critter | 2 | `critter_1`, `critter_2` |

**Citizens: 0.** No villager/peasant/townsfolk sheets. Closest NPC-like set is **neutral merc + tribal**.

## Anim kits (from **plist frame keys**, not invented attack 2/3)

| Kit | ~Count | Real clip names |
|-----|--------|-----------------|
| **core** | 696 | idle, breathing (aliases: breathe/breath), run (move/movement/walk), attack, hit (hurt/damage), death (die) |
| **caster** | 40 | + cast, caststart, castloop, castend |
| **projectile** | 32 | + projectile (alias: attackprojectile) |
| **special** | 6 | open (egg), explode (2), crawl (2), death2 (1) |

Codex right tab offers **that unit’s packed clips only**. Grouping: `runtime/DuelystSprite.js` `clipOf`. No attack2/3 in this pack.

## Variants / upgrades **in the filenames**

- General ladder: `general` → `altgeneral` / `3rdgeneral` → `tier2` / `altgeneraltier2`
- Skins: `*_skin*`
- Build rarity: `buildcommon` / `buildminion` / `buildlegendary` / `buildepic`
- Cosmetic: `golden*`, `prismatic*`
- Mk2: `elyxstormblademk2`, `bromemk2`

Open Duelyst **card rarity** (Basic/Common/Rare/Epic/Legendary) and keywords (Provoke, Zeal, Celerity, Rush, Flying, Frenzy, Airdrop, Blast, Build) are **game-data**, not sprite-folder rarity. Do not copy `card-map.json` “all Lyonar = rare, ATK 4” as truth.

## Use for battle cards

- **Organize PVE / board units** with this hierarchy (faction + role + anim kit).
- **Player mint names** stay Season 1 Clash (`thc-cnft-battle`).
- To use real Duelyst mana/ATK/HP/abilities, import Open Duelyst card JSON and join on `id` — do not invent a second bag.
