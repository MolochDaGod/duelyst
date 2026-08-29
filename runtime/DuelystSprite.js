/**
 * Duelyst 2D flipbook — packed sheet + plist rects.
 * Clip names come from TexturePacker frame keys, not a second anim system.
 * Phaser / Pixi / Three: nearest filter. Not a 3D AnimationMixer.
 */

/** Longest-first so caststart wins over cast, attackprojectile over attack. */
export const CLIP_NAMES = [
  "castendsample", "attackprojectile", "caststart", "castloop", "castend",
  "breathing", "breathe", "projectile", "explode", "impact", "attack",
  "idle", "run", "walk", "death2", "death", "hit", "hurt", "damage",
  "casting", "cast", "spawn", "summon", "crawl", "open", "move", "movement",
  "die", "breath",
];

const ALIAS = {
  breathe: "breathing",
  breath: "breathing",
  hurt: "hit",
  damage: "hit",
  die: "death",
  move: "run",
  movement: "run",
  walk: "run",
  attackprojectile: "projectile",
  casting: "cast",
  castendsample: "castend",
};

export const CLIP_LABEL = {
  breathing: "Breathe",
  idle: "Idle",
  run: "Run",
  crawl: "Crawl",
  attack: "Attack",
  projectile: "Projectile",
  caststart: "Cast start",
  castloop: "Cast loop",
  castend: "Cast end",
  cast: "Cast",
  hit: "Hit",
  death: "Death",
  death2: "Death 2",
  explode: "Explode",
  open: "Open",
  spawn: "Spawn",
  summon: "Summon",
  impact: "Impact",
};

export const CLIP_ORDER = [
  "breathing", "idle", "run", "crawl", "attack", "projectile",
  "caststart", "cast", "castloop", "castend",
  "hit", "death", "death2", "explode", "open", "spawn", "summon", "impact",
];

export const LOOP_CLIPS = new Set(["breathing", "idle", "run", "crawl", "castloop", "cast"]);

export function clipLabel(key) {
  if (CLIP_LABEL[key]) return CLIP_LABEL[key];
  return String(key || "clip").replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function clipOf(frameName) {
  const stem = String(frameName)
    .replace(/\.(png|jpg)$/i, "")
    .toLowerCase()
    .replace(/_\d+$/, "");
  const found = CLIP_NAMES.find((c) => {
    const cL = c.toLowerCase();
    return stem.endsWith("_" + cL) || stem === cL;
  });
  const raw = found ? found.toLowerCase() : (stem.match(/_([a-z][a-z0-9]+)$/) || [])[1] || "other";
  return ALIAS[raw] || raw;
}

/** @deprecated use clipOf — kept for old callers */
export function animOf(frameName) {
  return clipOf(frameName);
}

export function parsePlist(xml) {
  const frames = [];
  const re = /<key>([^<]+\.png)<\/key>\s*<dict>([\s\S]*?)<\/dict>/g;
  let m;
  while ((m = re.exec(xml))) {
    const name = m[1].trim();
    const inner = m[2];
    const fm = inner.match(/<key>frame<\/key>\s*<string>\{\{(\d+),(\d+)\},\{(\d+),(\d+)\}\}<\/string>/);
    if (!fm) continue;
    frames.push({
      name,
      x: +fm[1],
      y: +fm[2],
      w: +fm[3],
      h: +fm[4],
      anim: clipOf(name),
    });
  }
  frames.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return frames;
}

export function groupAnims(frames) {
  const o = {};
  for (const f of frames) (o[f.anim] ||= []).push(f);
  return o;
}

export function orderedClips(anims) {
  const keys = Object.keys(anims || {});
  const head = CLIP_ORDER.filter((k) => keys.includes(k));
  const tail = keys.filter((k) => !CLIP_ORDER.includes(k) && k !== "other").sort();
  if (anims && anims.other && anims.other.length) tail.push("other");
  return [...head, ...tail];
}

export function kitOf(anims) {
  const k = Object.keys(anims || {});
  const kit = ["core"];
  if (k.some((x) => x.startsWith("cast"))) kit.push("caster");
  if (k.includes("projectile")) kit.push("projectile");
  if (k.some((x) => ["open", "explode", "crawl", "death2", "spawn", "summon"].includes(x))) kit.push("special");
  return kit;
}

export function clipsFromPlistXml(xml) {
  const names = [...String(xml).matchAll(/<key>([^<]+\.png)<\/key>/g)].map((m) => m[1]);
  return [...new Set(names.map(clipOf))].filter((k) => k && k !== "other");
}

/** Three.js Sprite + CanvasTexture flipbook. Call tick(dt) in the existing rAF. */
export function createThreeFlipbook(THREE, image, frames, { fps = 20, loop = true, pxPerMeter = 32 } = {}) {
  let looping = loop;
  const canvas = document.createElement("canvas");
  const w = frames[0]?.w || 100;
  const h = frames[0]?.h || 100;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(w / pxPerMeter, h / pxPerMeter, 1);
  let i = 0;
  let acc = 0;
  const step = 1 / fps;
  function draw() {
    const fr = frames[i];
    if (!fr) return;
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, fr.x, fr.y, fr.w, fr.h, 0, 0, w, h);
    tex.needsUpdate = true;
  }
  draw();
  return {
    sprite,
    texture: tex,
    tick(dt) {
      if (frames.length < 2) return;
      acc += dt;
      while (acc >= step) {
        acc -= step;
        i += 1;
        if (i >= frames.length) i = looping ? 0 : frames.length - 1;
        draw();
      }
    },
    setFrames(next, { reset = true, loop = looping } = {}) {
      frames = next;
      looping = loop;
      if (reset) i = 0;
      draw();
    },
  };
}
