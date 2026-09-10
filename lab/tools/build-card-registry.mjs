/**
 * Grudge card registry for duelyst.grudge-studio.com.
 *
 * Mints a deterministic Grudge UUID per card (Duelyst unit, Season 1 PVE card,
 * GrudaWars hero), resolves every art/image reference to an absolute CDN URL,
 * and emits:
 *   catalog/cards.json           full registry (all sources, all art)
 *   api/v1/cards.json            paged-free API payload consumed by /api/v1/cards
 *   api/v1/cards-by-uuid.json    uuid -> card lookup
 *   api/v1/art.json              uuid -> every art/image asset for that card
 *   ../ObjectStore/workers/seed/grudge-cards.sql  D1 seed (grudge_cards + grudge_card_art)
 *
 * UUID format matches the fleet standard used by weapon_prefabs:
 *   CARD-<TS>-<SEQHEX>-<MD5-8>
 * The suffix hashes the stable source key, so re-running the bake keeps
 * every existing UUID byte-identical (idempotent).
 *
 * Run: node lab/tools/build-card-registry.mjs
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "../..");
const OBJECTSTORE = path.resolve(ROOT, "../ObjectStore");

/** Frozen mint epoch — never change, or every UUID rotates. */
const UUID_EPOCH = "20260901000000";
const UUID_PREFIX = "CARD";
const CDN = "https://assets.grudge-studio.com";
const DUELYST_CDN = `${CDN}/sprites/duelyst`;
const GW_CDN = `${CDN}/sprites/grudawars`;
const CARD_ART_CDN = "https://battle.thc-labz.xyz/card-art";
const SITE = "https://duelyst.grudge-studio.com";

/**
 * Deterministic Grudge UUID. `seq` orders the registry; `key` guarantees the
 * same source row always mints the same id even if ordering shifts.
 */
function grudgeUuid(seq, key) {
  const seqHex = seq.toString(16).toUpperCase().padStart(6, "0");
  const suffix = crypto.createHash("md5").update(`${UUID_PREFIX}-${key}-${UUID_EPOCH}`)
    .digest("hex").slice(0, 8).toUpperCase();
  return `${UUID_PREFIX}-${UUID_EPOCH}-${seqHex}-${suffix}`;
}

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}

/** Optional generated input — missing file means the clip index was never built. */
function readJsonSoft(rel, fallback) {
  try {
    return readJson(rel);
  } catch {
    console.warn(`warn: ${rel} missing — run lab/tools/build-clip-index.mjs`);
    return fallback;
  }
}

/** Turn any stored art reference into an absolute, fetchable URL. */
function absUrl(ref, base) {
  const s = String(ref || "").trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("/card-art/")) return CARD_ART_CDN + s.slice("/card-art".length);
  if (s.startsWith("/gw/")) return GW_CDN + s.slice("/gw".length);
  if (s.startsWith("/duelyst/")) return DUELYST_CDN + s.slice("/duelyst".length);
  if (s.startsWith("/")) return SITE + s;
  return `${base}/${s.replace(/^\.\//, "")}`;
}

const duel = readJson("catalog/duelyst-index.json");
const cat = readJson("catalog/catalog.json");
const layout = readJson("tcg-chrome/LAYOUT.json");
/** Per-clip frame data + VFX sprites, built from the source by build-clip-index.mjs. */
const clipIndex = readJsonSoft("catalog/duelyst-clips.json", { units: {} });
const vfxIndex = readJsonSoft("catalog/vfx-index.json", { effects: {} });
/**
 * THC Labz BadBudz re-skins the Magmar roster. Those units keep their Duelyst
 * UUID and sprites — the set only overlays presentation (strain name, rarity
 * ladder, chrome), so the registry enriches the existing rows rather than
 * minting duplicates.
 */
const badbudzSet = readJsonSoft("catalog/badbudz.json", { cards: [] });
const badbudzById = new Map((badbudzSet.cards || []).map((c) => [c.id, c]));
/** Per-city PVE backdrops (build-city-backgrounds.py). */
const cityBackgrounds = (() => {
  try {
    return JSON.parse(fs.readFileSync(
      path.join(ROOT, "tcg-chrome/cities/index.json"), "utf8")).byCity || {};
  } catch {
    return {};
  }
})();

/** Clip rows for a unit: frame counts, loop flag and sheet rect from the plist. */
function clipsFor(slug, fallbackNames) {
  // "boss_x copy" duplicates ship a sheet+plist but have no source plist file;
  // they are byte-identical to the base unit, so borrow its clips.
  const src = clipIndex.units?.[slug]?.clips
    || clipIndex.units?.[String(slug).replace(/ copy$/i, "")]?.clips;
  if (src) {
    return Object.entries(src).map(([name, c], i) => ({
      slot: i, name, label: c.label, frames: c.frames, loop: !!c.loop,
      w: c.w, h: c.h, first: c.first,
    }));
  }
  // GrudaWars heroes and PVE cards have no plist; keep the names we do know.
  return (fallbackNames || []).map((name, i) => ({
    slot: i, name, label: name, frames: null, loop: null, w: null, h: null, first: null,
  }));
}

/** Effect sprites a card references by key (attack slash, burst, projectile). */
function vfxArt(vfx) {
  const out = [];
  for (const [role, key] of Object.entries(vfx || {})) {
    const def = key && vfxIndex.effects?.[key];
    if (def?.url) out.push({ role: `vfx:${role}`, url: def.url, effect: key });
  }
  return out;
}

/** Chrome art (frame + background) is per-faction and part of the card's art set. */
function chromeArt(faction) {
  const fac = layout.factionFrame[faction] ? faction : "other";
  return [
    { role: "frame", url: `${SITE}/tcg-chrome/${layout.factionFrame[fac]}`, faction: fac },
    { role: "background", url: `${SITE}/tcg-chrome/${layout.factionBg[fac]}`, faction: fac },
  ];
}

/**
 * Season 1 cards wear the THC Labz cannabis chrome instead of the Duelyst
 * frames: the weed frame for the 12 city bosses, gold for the goons.
 */
function thcChromeArt(c) {
  const thc = layout.thc;
  if (!thc) return chromeArt("other");
  const key = thc.byRarity?.[c.rarity] || thc.default || "gold";
  const f = thc.frames?.[key];
  if (!f) return chromeArt("other");
  // Each dopebudz city has its own backdrop so cards stay visually distinct.
  const cityBg = c.city && cityBackgrounds[c.city];
  return [
    { role: "frame", url: `${SITE}/tcg-chrome/${f.frame}`, skin: `thc-${key}` },
    {
      role: "background",
      url: `${SITE}/tcg-chrome/${cityBg || thc.background}`,
      skin: cityBg ? `city-${c.city}` : `thc-${key}`,
    },
  ];
}

/** BadBudz cards carry the THC frame plus their strain background and bud wall. */
function badbudzChromeArt(bb) {
  const thc = layout.thc;
  const key = ["legendary", "epic"].includes(bb.rarity) ? "weed" : "gold";
  const f = thc?.frames?.[key];
  return [
    f && { role: "frame", url: `${SITE}/tcg-chrome/${f.frame}`, skin: `thc-${key}` },
    { role: "background", url: `${SITE}/tcg-chrome/${bb.chrome.bg}`, skin: `badbudz-${bb.rarity}` },
    { role: "buds", url: `${SITE}/tcg-chrome/${bb.chrome.buds}`, skin: `badbudz-${bb.rarity}` },
    { role: "logo", url: `${SITE}/tcg-chrome/${bb.chrome.logo}` },
  ].filter(Boolean);
}

const rows = [];
let seq = 0;

// ── Duelyst CC0 units ───────────────────────────────────────────────
for (const u of duel.units || []) {
  const key = `duelyst:${u.id}`;
  seq += 1;
  const clips = clipsFor(u.id, u.clips || u.anims);
  const bb = badbudzById.get(u.id);
  const art = [
    { role: "sheet", url: absUrl(u.sheet, DUELYST_CDN) },
    { role: "plist", url: absUrl(u.plist, DUELYST_CDN) },
    ...vfxArt(u.vfx),
    ...(bb ? badbudzChromeArt(bb) : chromeArt(u.faction || "other")),
  ].filter((a) => a.url);
  rows.push({
    uuid: grudgeUuid(seq, key),
    sourceKey: key,
    source: "duelyst",
    slug: u.id,
    name: bb ? bb.name : u.name,
    faction: bb ? "badbudz" : (u.faction || "other"),
    role: u.role || "minion",
    kind: u.kind || "troop",
    rarity: bb ? bb.rarity
      : u.role === "general" ? "legendary" : u.role === "boss" ? "epic" : "common",
    ...(bb ? {
      set: bb.set,
      setName: bb.setName,
      brand: bb.brand,
      rarityLabel: bb.rarityLabel,
      strain: bb.strain,
      duelystName: u.name,
    } : {}),
    cost: u.cost ?? null,
    attack: u.attack ?? null,
    health: u.health ?? null,
    range: u.range ?? null,
    speed: u.speed ?? null,
    effect: u.effect ?? null,
    keywords: u.keywords || u.abilities || [],
    abilityNames: bb ? bb.abilityNames : (u.abilityNames || []),
    passive: bb ? bb.passive : (u.passive || u.abilityText || ""),
    playStyles: u.playStyles || [],
    anims: u.clips || u.anims || [],
    clips,
    frameTotal: clips.reduce((a, c) => a + (c.frames || 0), 0),
    kits: u.kits || [],
    vfx: u.vfx || {},
    artWindow: layout.factionArt?.[u.faction] || layout.art,
    art,
  });
}

// ── Season 1 city PVE cards ─────────────────────────────────────────
for (const c of cat.cards || []) {
  const key = `season1:${c.city || "none"}:${c.id}`;
  seq += 1;
  // Art order matches what the site loads: the Growerz-style remake first where
  // one exists, then the keyed cutout (20 portraits ship on a flat studio plate
  // that hides the card's own backdrop), then the card-sized WebP (the mint
  // originals average 1.7 MB each), then the full-res mint, then the external
  // card-art host, which 404s for 47 of the 72 cards.
  const art = [
    { role: "portrait", url: absUrl(c.growerzImage || c.cutImage || c.cardImage || c.mintImage || c.image, CARD_ART_CDN) },
    { role: "portrait-classic", url: c.growerzImage ? absUrl(c.cutImage || c.cardImage, CARD_ART_CDN) : null },
    { role: "portrait-plate", url: c.cutImage ? absUrl(c.cardImage, CARD_ART_CDN) : null },
    { role: "portrait-full", url: c.cardImage ? absUrl(c.mintImage, CARD_ART_CDN) : null },
    { role: "portrait-alt", url: c.mintImage ? absUrl(c.image, CARD_ART_CDN) : null },
    ...thcChromeArt(c),
  ].filter((a) => a.url);
  rows.push({
    uuid: grudgeUuid(seq, key),
    sourceKey: key,
    source: "season-1",
    slug: c.id,
    name: c.name,
    faction: c.faction || c.city || "other",
    role: c.pveRole || c.role || "goon",
    kind: c.kind || "troop",
    rarity: c.rarity || "common",
    cost: c.cost ?? null,
    attack: c.attack ?? null,
    health: c.health ?? null,
    range: c.range ?? null,
    speed: c.speed ?? null,
    effect: c.effect ?? null,
    keywords: c.keywords || c.abilities || [],
    abilityNames: c.abilityNames || [],
    passive: c.passive || "",
    playStyles: c.playStyles || [],
    anims: [],
    clips: [],
    frameTotal: 0,
    kits: [],
    vfx: {},
    city: c.city || null,
    // These are not player mints: they are the AI opponents fought in the
    // dopebudz.* city PVE challenges — 12 cities, each with 5 goons and 1 boss.
    useCase: "pve-opponent",
    game: "dopebudz",
    encounter: (c.pveRole || c.role) === "boss" ? "city-boss-battle" : "city-challenge",
    playable: false,
    artWindow: (() => {
      const thc = layout.thc;
      const key = thc?.byRarity?.[c.rarity] || thc?.default || "gold";
      return thc?.frames?.[key]?.art || layout.factionArt?.other || layout.art;
    })(),
    art,
  });
}

// ── GrudaWars heroes ────────────────────────────────────────────────
for (const h of cat.heroes || []) {
  const key = `grudawars:${h.id}`;
  seq += 1;
  const art = [
    ...Object.entries(h.clips || {}).map(([clip, url]) => ({
      role: `clip:${clip}`, url: absUrl(url, GW_CDN),
    })),
    ...(h.fx || []).map((url) => ({ role: "fx", url: absUrl(url, GW_CDN) })),
    ...chromeArt("other"),
  ].filter((a) => a.url);
  rows.push({
    uuid: grudgeUuid(seq, key),
    sourceKey: key,
    source: "grudawars",
    slug: h.id,
    name: h.name,
    faction: "grudawars",
    role: "hero",
    kind: h.kind || "hero",
    rarity: "rare",
    cost: null, attack: null, health: null,
    range: null, speed: null, effect: null,
    keywords: [], abilityNames: [], passive: "",
    playStyles: [],
    anims: Object.keys(h.clips || {}),
    clips: clipsFor(h.id, Object.keys(h.clips || {})),
    frameTotal: 0,
    kits: [],
    vfx: {},
    iso: !!h.iso,
    artWindow: layout.factionArt?.other || layout.art,
    art,
  });
}

// ── Integrity ───────────────────────────────────────────────────────
const byUuid = new Map();
for (const r of rows) {
  if (byUuid.has(r.uuid)) throw new Error(`duplicate uuid ${r.uuid} (${r.sourceKey})`);
  byUuid.set(r.uuid, r);
}
const missingArt = rows.filter((r) => !r.art.some((a) => /portrait|sheet|clip:|mint/.test(a.role)));
const generated = new Date().toISOString();

const registry = {
  version: "1.0.0",
  generated,
  uuidFormat: `${UUID_PREFIX}-<epoch>-<seqHex>-<md5:8>`,
  site: SITE,
  cdn: CDN,
  notPlayerBag: true,
  total: rows.length,
  bySource: rows.reduce((a, r) => ((a[r.source] = (a[r.source] || 0) + 1), a), {}),
  artTotal: rows.reduce((a, r) => a + r.art.length, 0),
  clipTotal: rows.reduce((a, r) => a + (r.clips || []).length, 0),
  frameTotal: rows.reduce((a, r) => a + (r.frameTotal || 0), 0),
  vfxTotal: rows.reduce((a, r) => a + r.art.filter((x) => x.role.startsWith("vfx:")).length, 0),
  missingArt: missingArt.map((r) => r.uuid),
  cards: rows,
};

function write(rel, data) {
  const p = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, rel.endsWith("cards.json") ? 0 : 0));
  return p;
}

write("catalog/cards.json", registry);
write("api/v1/cards.json", {
  version: registry.version,
  generated,
  total: rows.length,
  uuidFormat: registry.uuidFormat,
  endpoints: {
    all: "/api/v1/cards.json",
    byUuid: "/api/v1/cards-by-uuid.json",
    art: "/api/v1/art.json",
    live: "https://objectstore.grudge-studio.com/v1/cards",
  },
  cards: rows.map(({ art, ...c }) => ({ ...c, artCount: art.length })),
});
write("api/v1/cards-by-uuid.json", Object.fromEntries(rows.map((r) => [r.uuid, r])));
write("api/v1/art.json", {
  generated,
  total: registry.artTotal,
  art: Object.fromEntries(rows.map((r) => [r.uuid, r.art])),
});
write("api/v1/clips.json", {
  generated,
  total: registry.clipTotal,
  frameTotal: registry.frameTotal,
  clips: Object.fromEntries(rows.filter((r) => (r.clips || []).length).map((r) => [r.uuid, r.clips])),
});
write("api/v1/vfx.json", {
  generated,
  source: vfxIndex.source || null,
  total: Object.keys(vfxIndex.effects || {}).length,
  effects: vfxIndex.effects || {},
});

// ── D1 seed ─────────────────────────────────────────────────────────
const q = (v) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const n = (v) => (v === null || v === undefined || v === "" ? "NULL" : Number.isFinite(Number(v)) ? Number(v) : "NULL");

const sql = [];
sql.push("-- Grudge card registry seed for grudge-objectstore D1");
sql.push(`-- Generated ${generated} by lab/tools/build-card-registry.mjs`);
sql.push("-- Run: wrangler d1 execute grudge-objectstore --remote --file=workers/seed/grudge-cards.sql");
sql.push("");
sql.push(fs.readFileSync(path.join(here, "grudge-cards.schema.sql"), "utf8").trim());
sql.push("");
sql.push("DELETE FROM grudge_card_clips;");
sql.push("DELETE FROM grudge_card_art;");
sql.push("DELETE FROM grudge_cards;");
sql.push("");

// D1 rejects any single statement over ~100 KB (SQLITE_TOOBIG), and card_json
// rows vary hugely in size, so batch by byte budget rather than a fixed count.
const MAX_STMT = 60_000;
function emitInsert(header, values) {
  let batch = [];
  let size = 0;
  const flush = () => {
    if (!batch.length) return;
    sql.push(header);
    sql.push(batch.join(",\n") + ";");
    sql.push("");
    batch = [];
    size = 0;
  };
  for (const v of values) {
    if (batch.length && size + v.length > MAX_STMT) flush();
    batch.push(v);
    size += v.length + 2;
  }
  flush();
}

emitInsert(
  "INSERT INTO grudge_cards (uuid, source_key, source, slug, name, faction, role, kind, rarity, cost, attack, health, range_text, speed, effect, keywords, ability_names, passive, play_styles, anims, clip_count, frame_total, kits, vfx, art_window, card_json) VALUES",
  rows.map((r) => `(${[
    q(r.uuid), q(r.sourceKey), q(r.source), q(r.slug), q(r.name), q(r.faction), q(r.role),
    q(r.kind), q(r.rarity), n(r.cost), n(r.attack), n(r.health), q(r.range), q(r.speed), q(r.effect),
    q(JSON.stringify(r.keywords)), q(JSON.stringify(r.abilityNames)), q(r.passive),
    q(JSON.stringify(r.playStyles)), q(JSON.stringify(r.anims)),
    (r.clips || []).length, r.frameTotal || 0, q(JSON.stringify(r.kits)),
    q(JSON.stringify(r.vfx)), q(JSON.stringify(r.artWindow)), q(JSON.stringify(r)),
  ].join(", ")})`),
);

const artRows = rows.flatMap((r) => r.art.map((a, i) => ({ ...a, uuid: r.uuid, i })));
emitInsert(
  "INSERT INTO grudge_card_art (card_uuid, slot, role, url) VALUES",
  artRows.map((a) => `(${[q(a.uuid), a.i, q(a.role), q(a.url)].join(", ")})`),
);

const clipRows = rows.flatMap((r) => (r.clips || []).map((c) => ({ ...c, uuid: r.uuid })));
emitInsert(
  "INSERT INTO grudge_card_clips (card_uuid, slot, name, label, frames, loop, w, h, first_x, first_y, first_w, first_h) VALUES",
  clipRows.map((c) => `(${[
    q(c.uuid), c.slot, q(c.name), q(c.label), n(c.frames), c.loop ? 1 : 0,
    n(c.w), n(c.h), n(c.first?.x), n(c.first?.y), n(c.first?.w), n(c.first?.h),
  ].join(", ")})`),
);

const seedPath = path.join(OBJECTSTORE, "workers", "seed", "grudge-cards.sql");
fs.mkdirSync(path.dirname(seedPath), { recursive: true });
fs.writeFileSync(seedPath, sql.join("\n"));

const longest = sql.reduce((a, s) => Math.max(a, s.length), 0);
console.log(`cards      ${rows.length}`, registry.bySource);
console.log(`art rows   ${artRows.length} (vfx ${registry.vfxTotal})`);
console.log(`clip rows  ${clipRows.length}  frames ${registry.frameTotal}`);
console.log(`no art     ${missingArt.length}`);
console.log(`max stmt   ${longest} bytes`);
console.log(`seed       ${seedPath}`);
