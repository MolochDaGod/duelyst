/**
 * Re-skin the Magmar faction as THC Labz **BadBudz**.
 *
 * The Duelyst sprites stay exactly as they are — this only replaces the
 * *presentation* layer: strain-themed names, a rarity ladder built from real
 * strain tiers, THC-flavoured keywords/ability text and the chrome tier that
 * picks which panning bud background the card wears.
 *
 * Everything is derived deterministically from the unit id, so re-running never
 * shuffles a card's name or rarity.
 *
 * Emits catalog/badbudz.json (consumed by the Codex and the card registry).
 *
 * Run: node lab/tools/build-badbudz.mjs
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "../..");

const SET = {
  id: "badbudz",
  name: "BadBudz",
  brand: "THC Labz",
  tagline: "Street-grown battle cards. Loud strains, louder fights.",
};

/** Rarity ladder = strain quality ladder, cheapest to loudest. */
const TIERS = [
  { key: "common", label: "Regz", strain: "Regz", weight: 22,
    blurb: "Backyard brick. Cheap, plentiful, still swings." },
  { key: "uncommon", label: "Sour Diesel", strain: "Sour Diesel", weight: 18,
    blurb: "Gas-forward sativa. Fast hands, faster mouth." },
  { key: "rare", label: "Sour D Purple", strain: "Sour D Purple", weight: 11,
    blurb: "Purple-run pheno. Heavier hit, meaner temper." },
  { key: "epic", label: "Purple Haze", strain: "Purple Haze", weight: 6,
    blurb: "Hazy heavyweight. Hits the field like a fog bank." },
  { key: "legendary", label: "Runtz", strain: "Runtz", weight: 2,
    blurb: "Loud-pack royalty. One of one, and it knows it." },
];

/** Deterministic 0..1 from a key — same unit always lands the same roll. */
function roll(key, salt) {
  const h = crypto.createHash("md5").update(`${SET.id}:${salt}:${key}`).digest();
  return h.readUInt32BE(0) / 0xffffffff;
}
const pick = (arr, key, salt) => arr[Math.floor(roll(key, salt) * arr.length) % arr.length];

// ── Name construction ────────────────────────────────────────────────
const PREFIX = [
  "Kush", "Haze", "Gelato", "Zkittle", "Runtz", "Gasgrade", "Trichome", "Terp",
  "Resin", "Dab", "Rosin", "Hash", "Sherb", "Cookie", "Diesel", "Skunk",
  "Purple", "Chronic", "Kief", "Budrot", "Nug", "Reefer", "Blunt", "Cypher",
];
const CORE = [
  "Brawler", "Bruiser", "Enforcer", "Runner", "Slinger", "Warden", "Reaper",
  "Stomper", "Hauler", "Bouncer", "Cutter", "Crasher", "Roller", "Grinder",
  "Prowler", "Bagman", "Shotcaller", "Tender", "Clipper", "Trimmer",
];
const HEAVY = [
  "Titan", "Colossus", "Behemoth", "Juggernaut", "Overlord", "Warlord",
  "Kingpin", "Godfather", "Boss", "Don",
];
const EPITHET = [
  "the Loud", "the Gassed", "the Sticky", "the Couchlock", "the Uncut",
  "the Zooted", "the Baked", "the Cured", "the Potent", "the Frosted",
  "the Blazed", "the Dank",
];

function makeName(u, tier) {
  const k = u.id;
  const p = pick(PREFIX, k, "p");
  if (u.role === "general" || u.role === "general-alt" || u.role === "general-tier2") {
    return `${p} ${pick(HEAVY, k, "h")} ${pick(EPITHET, k, "e")}`;
  }
  if (tier.key === "legendary") return `${p} ${pick(HEAVY, k, "h")}`;
  if (tier.key === "epic") return `${p} ${pick(CORE, k, "c")} ${pick(EPITHET, k, "e")}`;
  return `${p} ${pick(CORE, k, "c")}`;
}

// ── THC-flavoured combat vocabulary ──────────────────────────────────
/** Duelyst keyword -> the BadBudz ability it presents as. */
const ABILITY = {
  melee: { name: "Hand-to-Hand", text: "Swings in close. Nothing fancy, all knuckle." },
  ranged: { name: "Long Toke", text: "Reaches across the block without moving." },
  splash: { name: "Second-Hand", text: "The cloud catches everyone standing near." },
  flying: { name: "Head Change", text: "Floats over the fight, lands where it wants." },
  tank: { name: "Couchlock", text: "Too heavy to move. Soaks the hit and grins." },
  charge: { name: "Fast Burn", text: "Lit on arrival — moves the turn it drops." },
  spell: { name: "Lab Grade", text: "Extracted, not grown. Rules bend around it." },
};

const PASSIVE = [
  "Gains strength while the cloud is thick.",
  "Every hit cures it a little harder.",
  "Terps flare on contact — the burn lingers.",
  "Runs the block; nothing crosses without paying.",
  "Rolls deep. The pack shows up with it.",
  "Grinds down whatever it touches.",
  "The gas gets in everything nearby.",
  "Trims the weak side of the field first.",
];

function tierFor(u) {
  // Generals sit at the top of the ladder; everything else rolls on weight.
  if (["general", "general-alt", "general-tier2"].includes(u.role)) {
    return TIERS[TIERS.length - 1];
  }
  if (u.role === "token-minion" || u.role === "build-common") return TIERS[0];
  const total = TIERS.reduce((a, t) => a + t.weight, 0);
  let r = roll(u.id, "tier") * total;
  for (const t of TIERS) {
    r -= t.weight;
    if (r <= 0) return t;
  }
  return TIERS[0];
}

// ── Build ────────────────────────────────────────────────────────────
const duel = JSON.parse(fs.readFileSync(path.join(ROOT, "catalog/duelyst-index.json"), "utf8"));
const chrome = JSON.parse(fs.readFileSync(path.join(ROOT, "tcg-chrome/thc/chrome.json"), "utf8"));

const source = (duel.units || []).filter((u) => u.faction === "magmar");
if (!source.length) {
  console.error("no magmar units found in catalog/duelyst-index.json");
  process.exit(1);
}

const cards = source.map((u) => {
  const isEgg = u.id === "f5_egg";
  const tier = isEgg ? TIERS[3] : tierFor(u); // Epic tier for the Bad Seed
  const keys = u.keywords || u.abilities || [];
  const abilities = keys.map((k) => ABILITY[k]).filter(Boolean);
  const name = isEgg ? "Bad Seed" : makeName(u, tier);
  return {
    id: u.id,
    name,
    set: SET.id,
    setName: SET.name,
    brand: SET.brand,
    faction: "badbudz",
    role: isEgg ? "seed" : u.role,
    kind: isEgg ? "seed" : (u.kind || "troop"),
    rarity: tier.key,
    rarityLabel: tier.label,
    strain: isEgg ? "Bad Seed" : tier.strain,
    strainBlurb: isEgg ? "A potent BadBudz seed germinating in the dark. Hold onto this — you know you will see some BadBudz." : tier.blurb,
    chrome: {
      bg: chrome.tiers[tier.key].bg,
      buds: chrome.tiers[tier.key].buds,
      wallW: chrome.tiers[tier.key].wallW,
      wallH: chrome.tiers[tier.key].wallH,
      logo: chrome.logo,
    },
    keywords: isEgg ? ["seed", "incubate", "badbudz"] : keys,
    abilityNames: isEgg ? ["Incubate", "BadBudz Genesis"] : abilities.map((a) => a.name),
    passive: isEgg ? "Bad Seed - Hold on to this, you know you will see some BadBudz." : (abilities[0]?.text || pick(PASSIVE, u.id, "passive")),
    flavor: isEgg ? "Bad Seed - Hold on to this, you know you will see some BadBudz." : pick(PASSIVE, u.id, "flavor"),
    // Potency replaces "cost" in the BadBudz framing; stats carry over as-is.
    cost: u.cost ?? 1,
    attack: u.attack ?? 0,
    health: u.health ?? 10,
    range: u.range ?? "None",
    speed: u.speed ?? "Static",
    effect: u.effect ?? "Glow",
    playStyles: u.playStyles || [],
    anims: u.clips || u.anims || [],
    kits: u.kits || [],
    vfx: u.vfx || {},
    // No sheet/plist here on purpose: the Codex merges this record over the
    // Duelyst unit, which already carries them in whatever form the host needs
    // (CDN absolute in production, proxy-relative locally). Duplicating the
    // absolute URL here would bypass that and break local previews on CORS.
    duelystId: u.id,
    duelystName: u.name,
  };
});

const byRarity = cards.reduce((a, c) => ((a[c.rarity] = (a[c.rarity] || 0) + 1), a), {});
const dupeNames = Object.entries(
  cards.reduce((a, c) => ((a[c.name] = (a[c.name] || 0) + 1), a), {}),
).filter(([, n]) => n > 1);

// A repeated name would read as a duplicate card, so disambiguate with the
// epithet pool rather than letting two cards ship the same title.
for (const [name] of dupeNames) {
  const hits = cards.filter((c) => c.name === name);
  hits.slice(1).forEach((c, i) => {
    c.name = `${name} ${EPITHET[(i + Math.floor(roll(c.id, "fix") * EPITHET.length)) % EPITHET.length]}`;
  });
}
const stillDupe = Object.values(
  cards.reduce((a, c) => ((a[c.name] = (a[c.name] || 0) + 1), a), {}),
).filter((n) => n > 1).length;

const out = {
  ...SET,
  generated: new Date().toISOString(),
  total: cards.length,
  byRarity,
  tiers: TIERS,
  chrome,
  notPlayerBag: true,
  cards,
};
fs.writeFileSync(path.join(ROOT, "catalog/badbudz.json"), JSON.stringify(out));

console.log(`BadBudz cards ${cards.length}`, byRarity);
console.log(`name collisions fixed ${dupeNames.length}, remaining ${stillDupe}`);
console.log("samples:");
for (const t of TIERS) {
  const c = cards.find((x) => x.rarity === t.key);
  if (c) console.log(`  ${t.label.padEnd(14)} ${c.name.padEnd(34)} <- ${c.duelystName}`);
}
console.log("-> catalog/badbudz.json");
