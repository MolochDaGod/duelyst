/**
 * Bake static Codex for duelyst.grudge-studio.com
 * Binaries stay on R2; this dist is HTML + JSON + tcg-chrome + runtime JS.
 */
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clashAbility } from "../clash-abilities.mjs";
import { kitOf, clipsFromPlistXml } from "../runtime/DuelystSprite.js";
import { flattenCityPve } from "../../rpg-maker-studio/pve-roster.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const DUEL = path.resolve(here, "..");
const STUDIO = path.resolve(here, "../../rpg-maker-studio");
const DIST = path.join(STUDIO, "dist");
const CDN = "https://assets.grudge-studio.com/sprites/duelyst";
const CAT = JSON.parse(fs.readFileSync(path.join(DUEL, "catalog.json"), "utf8"));
const HIER = JSON.parse(fs.readFileSync(path.join(DUEL, "hierarchy.json"), "utf8"));
const STUDIO_CAT = JSON.parse(fs.readFileSync(path.join(STUDIO, "catalog.json"), "utf8"));

function slash(p) { return String(p || "").replace(/\\/g, "/"); }
function prettyName(h, u) {
  const fac = h.faction || u.faction || "other";
  let name = String(h.name || u.id).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^(alt|tier2|3rd)(?=\w)/i, "$1 ");
  if (/general/i.test(name) && fac !== "other" && !name.toLowerCase().includes(fac)) {
    name = fac[0].toUpperCase() + fac.slice(1) + " " + name;
  }
  return name;
}

const hier = new Map((HIER.units || []).map((u) => [u.id, u]));
const units = (CAT.units || []).map((u) => {
  const h = hier.get(u.id) || {};
  const plistAbs = path.join(DUEL, u.plist || `Duelyst-Sprites/Scripts/XMLS/${u.id}.plist`);
  const clips = fs.existsSync(plistAbs)
    ? clipsFromPlistXml(fs.readFileSync(plistAbs, "utf8"))
    : (h.anims || []);
  const animMap = Object.fromEntries(clips.map((c) => [c, true]));
  const kits = kitOf(animMap);
  const row = {
    id: u.id,
    name: prettyName(h, u),
    faction: h.faction || u.faction || "other",
    role: h.role || "minion",
    anims: clips,
    clips,
    kits,
    hasCast: kits.includes("caster"),
    hasProjectile: kits.includes("projectile"),
    sheet: `${CDN}/units/${u.id}.png`,
    plist: `${CDN}/plists/${u.id}.plist`,
  };
  const ab = clashAbility(row);
  return { ...row, ...ab, abilities: ab.keywords, abilityText: ab.text };
});

const index = {
  count: units.length,
  // Count from the units themselves — a hand-maintained map drifts (the old one
  // claimed `other: 2` for what are really `critter` units, producing a dead
  // faction chip in the Codex that filtered to nothing).
  factions: units.reduce((a, u) => ((a[u.faction] = (a[u.faction] || 0) + 1), a), {}),
  roles: HIER.roles || {},
  cdn: CDN,
  notPlayerBag: true,
  units,
};

const GW_CDN = "https://assets.grudge-studio.com/sprites/grudawars";
const pveCards = flattenCityPve();
// Card-sized portraits (build-pve-thumbs.py). The mint originals average 1.7 MB
// each, which made the 72-card grid pull ~122 MB; the WebP set is 3.5 MB total.
let pveThumbs = {};
try {
  pveThumbs = JSON.parse(fs.readFileSync(
    path.resolve(here, "../../catalog/pve-thumbs.json"), "utf8")).byCardId || {};
} catch {
  console.warn("no catalog/pve-thumbs.json — run lab/tools/build-pve-thumbs.py");
}
// Portraits whose flat studio plate has been keyed out (cut-pve-backgrounds.py).
let pveCutouts = {};
try {
  pveCutouts = JSON.parse(fs.readFileSync(
    path.resolve(here, "../../catalog/pve-cutouts.json"), "utf8")).byCardId || {};
} catch {
  console.warn("no catalog/pve-cutouts.json — run lab/tools/cut-pve-backgrounds.py");
}
// Growerz-NFT-style toonified remakes (toonify_growerz.py, run externally) —
// highest-precedence portrait source; wins over cutouts/thumbs/mint.
let pveGrowerz = {};
try {
  pveGrowerz = JSON.parse(fs.readFileSync(
    path.resolve(here, "../../catalog/pve-growerz-overrides.json"), "utf8")).byCardId || {};
} catch {
  console.warn("no catalog/pve-growerz-overrides.json");
}
for (const c of pveCards) {
  if (pveThumbs[c.id]) c.cardImage = pveThumbs[c.id];
  // Twenty of the Season 1 portraits were painted on a flat studio plate, which
  // covered the card's own city backdrop with a slab of one flat colour. The cut
  // version is transparent-backed, so it goes first in the portrait chain.
  if (pveCutouts[c.id]) c.cutImage = pveCutouts[c.id];
  if (pveGrowerz[c.id]) c.growerzImage = pveGrowerz[c.id];
}
const heroes = (STUDIO_CAT.heroes || []).map((h) => ({
  ...h,
  clips: Object.fromEntries(
    Object.entries(h.clips || {}).map(([k, url]) => [
      k,
      String(url).replace(/^\/gw\//, GW_CDN + "/"),
    ]),
  ),
}));
const catalog = {
  purpose: "catalog",
  notPlayerBag: true,
  cardCount: pveCards.length,
  heroCount: heroes.length,
  fxCount: STUDIO_CAT.fxCount || 0,
  duelystUnits: units.length,
  heroes,
  cards: pveCards,
  cities: [...new Set(pveCards.map((c) => c.city))],
};

const vercelMeta = path.join(DIST, ".vercel");
let vercelKeep = null;
if (fs.existsSync(path.join(vercelMeta, "project.json"))) {
  vercelKeep = fs.readFileSync(path.join(vercelMeta, "project.json"), "utf8");
}
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(path.join(DIST, "catalog"), { recursive: true });
if (vercelKeep) {
  fs.mkdirSync(path.join(DIST, ".vercel"), { recursive: true });
  fs.writeFileSync(path.join(DIST, ".vercel", "project.json"), vercelKeep);
}
fs.mkdirSync(path.join(DIST, "runtime"), { recursive: true });
fs.copyFileSync(path.join(STUDIO, "showcase.html"), path.join(DIST, "index.html"));
fs.copyFileSync(path.join(STUDIO, "showcase.html"), path.join(DIST, "rpg-maker-studio.html"));
fs.writeFileSync(path.join(DIST, "catalog", "duelyst-index.json"), JSON.stringify(index));
fs.writeFileSync(path.join(DIST, "catalog", "catalog.json"), JSON.stringify(catalog));
fs.copyFileSync(path.join(DUEL, "runtime", "DuelystSprite.js"), path.join(DIST, "runtime", "DuelystSprite.js"));
fs.cpSync(path.join(STUDIO, "tcg-chrome"), path.join(DIST, "tcg-chrome"), { recursive: true });
fs.writeFileSync(path.join(DIST, "vercel.json"), JSON.stringify({
  cleanUrls: true,
  headers: [{ source: "/(.*)", headers: [{ key: "Access-Control-Allow-Origin", value: "*" }] }],
  rewrites: [
    { source: "/info-vfx/:path*", destination: "https://info.grudge-studio.com/:path*" },
    { source: "/duelyst/:path*", destination: "https://assets.grudge-studio.com/sprites/duelyst/:path*" },
    { source: "/gw/:path*", destination: "https://assets.grudge-studio.com/sprites/grudawars/:path*" },
    { source: "/card-art/:path*", destination: "https://battle.thc-labz.xyz/card-art/:path*" },
    { source: "/rpg-maker-studio", destination: "/index.html" },
    { source: "/api/v1/cards", destination: "/api/v1/cards.json" },
    { source: "/api/v1/art", destination: "/api/v1/art.json" },
    { source: "/api/v1/cards-by-uuid", destination: "/api/v1/cards-by-uuid.json" },
    { source: "/api/v1/clips", destination: "/api/v1/clips.json" },
    { source: "/api/v1/vfx", destination: "/api/v1/vfx.json" },
    { source: "/((?!catalog/|tcg-chrome/|runtime/|api/|gw/|card-art/).*)", destination: "/index.html" },
  ],
}, null, 2));

const gamedata = path.join("F:/GitHub/Game-Studio-Tool/artifacts/grudge-islands/src/gamedata/2d/duelyst.json");
fs.mkdirSync(path.dirname(gamedata), { recursive: true });
fs.writeFileSync(gamedata, JSON.stringify({
  kind: "duelyst-2d",
  notPlayerBag: true,
  cdn: CDN,
  count: units.length,
  factions: index.factions,
  roles: index.roles,
  units: units.map((u) => ({
    id: u.id, name: u.name, faction: u.faction, role: u.role, kind: u.kind,
    keywords: u.keywords, cost: u.cost, attack: u.attack, health: u.health,
    range: u.range, speed: u.speed, effect: u.effect, passive: u.passive,
    sheet: u.sheet, plist: u.plist,
  })),
}, null, 2));

const infoJson = path.join("F:/GitHub/ObjectStore/api/v1/duelyst-units.json");
fs.writeFileSync(infoJson, JSON.stringify({
  version: "1.0.0",
  description: "Duelyst CC0 unit index — binaries on assets.grudge-studio.com/sprites/duelyst/",
  notPlayerBag: true,
  total: units.length,
  cdn: CDN,
  factions: index.factions,
  units: units.map((u) => ({ id: u.id, name: u.name, faction: u.faction, role: u.role, kind: u.kind, keywords: u.keywords, sheet: u.sheet, plist: u.plist })),
}, null, 2));

fs.mkdirSync(path.join(DIST, "api", "v1"), { recursive: true });
fs.copyFileSync(infoJson, path.join(DIST, "api", "v1", "duelyst-units.json"));

// ── Grudge card registry (UUID + art index + API payloads) ──────────
// build-card-registry.mjs reads catalog/*.json, so it must run after the
// writes above; it emits catalog/cards.json + api/v1/{cards,art,cards-by-uuid}.
const DUEL_REPO = path.resolve(here, "../..");
fs.writeFileSync(path.join(DUEL_REPO, "catalog", "duelyst-index.json"), JSON.stringify(index));
fs.writeFileSync(path.join(DUEL_REPO, "catalog", "catalog.json"), JSON.stringify(catalog));
// Per-clip frame data + VFX sprites come from the extracted source; keep the
// committed index when the source drive is not mounted on this machine.
try {
  execFileSync(process.execPath, [path.join(here, "build-clip-index.mjs")], { stdio: "inherit" });
} catch (e) {
  console.warn("clip index skipped (source unavailable), using committed catalog/duelyst-clips.json");
}
// BadBudz re-skins the Magmar roster and must be minted before the registry so
// those rows carry the strain name and rarity rather than the Duelyst ones.
execFileSync(process.execPath, [path.join(here, "build-badbudz.mjs")], { stdio: "inherit" });
execFileSync(process.execPath, [path.join(here, "build-card-registry.mjs")], { stdio: "inherit" });
for (const f of ["cards.json", "duelyst-clips.json", "vfx-index.json", "grudawars-clips.json", "pve-thumbs.json", "pve-cutouts.json", "pve-growerz-overrides.json", "badbudz.json"]) {
  const src = path.join(DUEL_REPO, "catalog", f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(DIST, "catalog", f));
}
for (const f of ["cards.json", "art.json", "cards-by-uuid.json", "clips.json", "vfx.json"]) {
  fs.copyFileSync(path.join(DUEL_REPO, "api", "v1", f), path.join(DIST, "api", "v1", f));
}
fs.cpSync(path.join(DUEL_REPO, "tcg-chrome"), path.join(DIST, "tcg-chrome"), { recursive: true });

const registry = JSON.parse(fs.readFileSync(path.join(DUEL_REPO, "catalog", "cards.json"), "utf8"));
console.log("baked", DIST, "units", units.length, "pve", pveCards.length, "gw", heroes.length,
  "| registry", registry.total, "cards", registry.artTotal, "art",
  registry.clipTotal, "clips", registry.frameTotal, "frames");
