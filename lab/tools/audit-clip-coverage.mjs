/**
 * Compare the shipped catalog/duelyst-index.json clip lists against the clips
 * actually present in the source TexturePacker plists + Unity .anim clips.
 *
 * Run: node lab/tools/audit-clip-coverage.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clipOf, clipsFromPlistXml } from "../runtime/DuelystSprite.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, "../..");
const SRC = process.env.DUELYST_SRC || "D:/Games/Models/_extract/duelyst";
const XMLS = path.join(SRC, "Duelyst-Sprites/Scripts/XMLS");
const ANIM = path.join(SRC, "Duelyst-Sprites/Animations/Units");

const index = JSON.parse(fs.readFileSync(path.join(REPO, "catalog/duelyst-index.json"), "utf8"));
const shipped = new Map((index.units || []).map((u) => [u.id, new Set(u.clips || u.anims || [])]));

// ── source clips from plists (the frames that actually exist on the sheet) ──
const fromPlist = new Map();
const frameCounts = new Map();
for (const f of fs.readdirSync(XMLS).filter((x) => x.endsWith(".plist"))) {
  const id = f.replace(/\.plist$/i, "");
  const xml = fs.readFileSync(path.join(XMLS, f), "utf8");
  fromPlist.set(id, new Set(clipsFromPlistXml(xml)));
  const counts = {};
  for (const m of xml.matchAll(/<key>([^<]+\.png)<\/key>/g)) {
    const c = clipOf(m[1]);
    counts[c] = (counts[c] || 0) + 1;
  }
  frameCounts.set(id, counts);
}

// ── source clips from Unity .anim files ──
const fromUnity = new Map();
function walk(dir, unit) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p, unit || e.name); continue; }
    if (!e.name.endsWith(".anim")) continue;
    const id = unit || path.basename(dir);
    const stem = e.name.replace(/\.anim$/i, "");
    const suffix = stem.toLowerCase().startsWith(id.toLowerCase())
      ? stem.slice(id.length).replace(/^_/, "")
      : stem;
    if (!fromUnity.has(id)) fromUnity.set(id, new Set());
    fromUnity.get(id).add(clipOf("x_" + suffix));
  }
}
if (fs.existsSync(ANIM)) walk(ANIM);

const rows = [];
const missingByClip = new Map();
const otherUnits = [];
for (const [id, plistClips] of fromPlist) {
  const have = shipped.get(id);
  const unity = fromUnity.get(id) || new Set();
  const want = new Set([...plistClips, ...[...unity].filter((c) => plistClips.has(c))]);
  const counts = frameCounts.get(id) || {};
  if (counts.other) otherUnits.push(`${id} other=${counts.other}`);
  if (!have) { rows.push({ id, missing: [...want], note: "NOT IN INDEX" }); continue; }
  const missing = [...want].filter((c) => !have.has(c));
  const extra = [...have].filter((c) => !want.has(c));
  if (missing.length || extra.length) rows.push({ id, missing, extra });
  for (const c of missing) missingByClip.set(c, (missingByClip.get(c) || 0) + 1);
}

const notInSource = [...shipped.keys()].filter((id) => !fromPlist.has(id));

console.log("shipped units          ", shipped.size);
console.log("source plists          ", fromPlist.size);
console.log("units with a mismatch  ", rows.length);
console.log("units not in source    ", notInSource.length, notInSource.slice(0, 10).join(", "));
console.log("\n=== missing clips by type ===");
[...missingByClip.entries()].sort((a, b) => b[1] - a[1])
  .forEach(([k, n]) => console.log(String(n).padStart(5), k));
console.log("\n=== units whose plist has unclassified 'other' frames ===");
console.log(otherUnits.length ? otherUnits.join("\n") : "(none)");
console.log("\n=== first 40 mismatches ===");
rows.slice(0, 40).forEach((r) =>
  console.log(r.id.padEnd(28), "missing:", (r.missing || []).join(",") || "-",
    "| extra:", (r.extra || []).join(",") || "-", r.note || ""));

fs.writeFileSync(path.join(here, "clip-coverage-report.json"),
  JSON.stringify({ mismatches: rows, notInSource, frameCounts: Object.fromEntries(frameCounts) }, null, 1));
console.log("\nreport → lab/tools/clip-coverage-report.json");
