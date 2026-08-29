/**
 * Audit original Duelyst Unity clips + plist frame names vs Codex grouping.
 */
import fs from "node:fs";
import path from "node:path";

const DUEL = "D:/Games/Models/_extract/duelyst";
const ANIM = path.join(DUEL, "Duelyst-Sprites/Animations/Units");
const PLIST = path.join(DUEL, "Duelyst-Sprites/Scripts/XMLS");

const suffixes = new Map();
const perUnit = new Map();

function walk(dir, unit) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, unit || e.name);
    else if (e.name.endsWith(".anim")) {
      const id = unit || path.basename(dir);
      const stem = e.name.replace(/\.anim$/i, "");
      let suf = stem;
      const low = stem.toLowerCase();
      const idl = id.toLowerCase();
      if (low.startsWith(idl + "_")) suf = stem.slice(id.length + 1);
      else if (low.startsWith(idl)) suf = stem.slice(id.length).replace(/^_/, "");
      suffixes.set(suf, (suffixes.get(suf) || 0) + 1);
      if (!perUnit.has(id)) perUnit.set(id, new Set());
      perUnit.get(id).add(suf);
    }
  }
}
walk(ANIM);

console.log("=== UNITY .anim suffixes ===");
[...suffixes.entries()]
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .forEach(([k, n]) => console.log(String(n).padStart(4), k));

const clipSets = new Map();
for (const [, set] of perUnit) {
  const key = [...set].sort().join(",");
  clipSets.set(key, (clipSets.get(key) || 0) + 1);
}
console.log("\n=== clip-set patterns ===");
[...clipSets.entries()]
  .sort((a, b) => b[1] - a[1])
  .forEach(([k, n]) => console.log(String(n).padStart(4), k));

const TOKENS = [
  "caststart", "castend", "castloop", "projectile", "explode", "impact",
  "attack", "breathing", "idle", "run", "walk", "death", "hit", "cast", "spawn", "summon",
];
function animOf(frameName) {
  const stem = String(frameName).replace(/\.(png|jpg)$/i, "").toLowerCase();
  return TOKENS.find((t) => stem.includes(t)) || "other";
}

const plistTokens = new Map();
const otherSamples = [];
const perUnitPlist = new Map();
for (const f of fs.readdirSync(PLIST).filter((x) => x.endsWith(".plist"))) {
  const id = f.replace(/\.plist$/i, "");
  const xml = fs.readFileSync(path.join(PLIST, f), "utf8");
  const names = [...xml.matchAll(/<key>([^<]+\.png)<\/key>/g)].map((m) => m[1]);
  const buckets = new Map();
  for (const name of names) {
    const a = animOf(name);
    buckets.set(a, (buckets.get(a) || 0) + 1);
    plistTokens.set(a, (plistTokens.get(a) || 0) + 1);
    if (a === "other" && otherSamples.length < 40) otherSamples.push(id + " :: " + name);
  }
  perUnitPlist.set(id, buckets);
}

console.log("\n=== plist frame buckets (animOf) ===");
[...plistTokens.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(String(n).padStart(6), k));
console.log("\n=== other frame samples ===");
otherSamples.forEach((s) => console.log(s));

const extraClips = [];
for (const [id, set] of perUnit) {
  for (const suf of set) {
    const n = suf.toLowerCase();
    if (!/^(idle|breathing|run|walk|attack|hit|death|cast|caststart|castloop|castend|projectile|explode|impact|spawn|summon)$/.test(n)) {
      extraClips.push(id + " :: " + suf);
    }
  }
}
console.log("\n=== unusual Unity clip suffixes ===");
extraClips.sort().forEach((s) => console.log(s));
console.log("unusual count", extraClips.length);
