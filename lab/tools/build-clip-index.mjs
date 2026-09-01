/**
 * Build catalog/duelyst-clips.json and catalog/vfx-index.json.
 *
 * The Codex index only ever carried clip *names*. The source plists also hold
 * every frame rect, so this emits per-clip frame counts + sprite size, and
 * resolves the VFX/projectile effect sprites that units reference by key.
 *
 * Needs the extracted source (DUELYST_SRC, default D:/Games/Models/_extract/duelyst).
 * Output is committed so build-card-registry.mjs stays repo-only.
 *
 * Run: node lab/tools/build-clip-index.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LOOP_CLIPS, clipLabel, clipOf, parsePlist } from "../runtime/DuelystSprite.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "../..");
const SRC = process.env.DUELYST_SRC || "D:/Games/Models/_extract/duelyst";
const XMLS = path.join(SRC, "Duelyst-Sprites/Scripts/XMLS");
const ANIM = path.join(SRC, "Duelyst-Sprites/Animations/Units");
const INFO = "https://info.grudge-studio.com";

if (!fs.existsSync(XMLS)) {
  console.error(`source plists not found at ${XMLS} — set DUELYST_SRC`);
  process.exit(1);
}

// ── Unity .anim clips, so we can flag clips the sheet does not back ──
const unityClips = new Map();
function walkAnims(dir, unit) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walkAnims(p, unit || e.name); continue; }
    if (!e.name.endsWith(".anim")) continue;
    const id = unit || path.basename(dir);
    const stem = e.name.replace(/\.anim$/i, "");
    const suffix = stem.toLowerCase().startsWith(id.toLowerCase())
      ? stem.slice(id.length).replace(/^_/, "")
      : stem;
    if (!unityClips.has(id)) unityClips.set(id, new Set());
    unityClips.get(id).add(clipOf("x_" + suffix));
  }
}
if (fs.existsSync(ANIM)) walkAnims(ANIM);

const units = {};
let clipTotal = 0;
let frameTotal = 0;

for (const file of fs.readdirSync(XMLS).filter((f) => f.endsWith(".plist"))) {
  const id = file.replace(/\.plist$/i, "");
  const frames = parsePlist(fs.readFileSync(path.join(XMLS, file), "utf8"));
  if (!frames.length) continue;

  const byClip = new Map();
  for (const f of frames) {
    if (!byClip.has(f.anim)) byClip.set(f.anim, []);
    byClip.get(f.anim).push(f);
  }

  const clips = {};
  for (const [name, list] of byClip) {
    if (name === "other") continue;
    clips[name] = {
      label: clipLabel(name),
      frames: list.length,
      loop: LOOP_CLIPS.has(name),
      w: Math.max(...list.map((f) => f.w)),
      h: Math.max(...list.map((f) => f.h)),
      // Sheet-relative rects, so a consumer can slice without re-parsing the plist.
      first: { x: list[0].x, y: list[0].y, w: list[0].w, h: list[0].h },
    };
    clipTotal += 1;
    frameTotal += list.length;
  }

  const unity = unityClips.get(id) || new Set();
  units[id] = {
    clips,
    frameTotal: Object.values(clips).reduce((a, c) => a + c.frames, 0),
    // Clips Unity declares but the packed sheet has no frames for.
    unbackedClips: [...unity].filter((c) => c !== "other" && !clips[c]),
  };
}

// ── VFX / projectile effect sprites ─────────────────────────────────
let vfx = { effects: {} };
const vfxOut = path.join(ROOT, "catalog/vfx-index.json");
try {
  const r = await fetch(`${INFO}/api/v1/effectSprites.json`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  // The catalog lives on info.* but the sprite PNGs are served from sourceBase;
  // info.* answers every /sprites/** path with its SPA shell (200 + HTML), so
  // resolving against it silently yields undecodable images.
  const base = String(j.sourceBase || INFO).replace(/\/$/, "");
  const effects = {};
  for (const [key, def] of Object.entries(j.effects || {})) {
    effects[key] = {
      ...def,
      url: /^https?:/i.test(def.src || "") ? def.src : base + (def.src || ""),
    };
  }
  vfx = { source: INFO, spriteBase: base, count: Object.keys(effects).length, effects };
  console.log("vfx effects fetched", vfx.count, "from", base);
} catch (e) {
  if (fs.existsSync(vfxOut)) {
    vfx = JSON.parse(fs.readFileSync(vfxOut, "utf8"));
    console.warn("vfx fetch failed, kept existing catalog/vfx-index.json:", e.message);
  } else {
    console.warn("vfx fetch failed and no cached file:", e.message);
  }
}

fs.mkdirSync(path.join(ROOT, "catalog"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "catalog/duelyst-clips.json"),
  JSON.stringify({ unitCount: Object.keys(units).length, clipTotal, frameTotal, units }));
fs.writeFileSync(vfxOut, JSON.stringify(vfx));

const unbacked = Object.entries(units).filter(([, u]) => u.unbackedClips.length);
console.log("units", Object.keys(units).length, "clips", clipTotal, "frames", frameTotal);
console.log("units with unbacked Unity clips", unbacked.length);
console.log("→ catalog/duelyst-clips.json, catalog/vfx-index.json");
