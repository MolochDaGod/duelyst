/** Codex-style 2x card faces: plist idle + Scale2x + chrome frame. */
const CHROME = "https://duelyst.grudge-studio.com/tcg-chrome";
const CW = 195, CH = 284, SX = 2;
const CARD_FONT = '"Libre Baskerville", Cambria, "Palatino Linotype", Palatino, Georgia, serif';

let fontsReady = null;
function ensureFonts() {
  if (fontsReady) return fontsReady;
  fontsReady = (document.fonts
    ? Promise.all([
      document.fonts.load(`700 14px ${CARD_FONT}`),
      document.fonts.load(`400 10px ${CARD_FONT}`),
      document.fonts.load(`700 18px ${CARD_FONT}`),
    ])
    : Promise.resolve()).catch(() => {});
  return fontsReady;
}

export function parsePlist(xml) {
  const frames = [];
  const re = /<key>([^<]+\.png)<\/key>\s*<dict>([\s\S]*?)<\/dict>/g;
  let m;
  while ((m = re.exec(xml))) {
    const name = m[1].trim();
    const fm = m[2].match(/<key>frame<\/key>\s*<string>\{\{(\d+),(\d+)\},\{(\d+),(\d+)\}\}<\/string>/);
    if (!fm) continue;
    const stem = name.toLowerCase().replace(/\.png$/, "").replace(/_\d+$/, "");
    let anim = "other";
    for (const k of ["breathing", "idle", "attack", "run", "hit", "death"]) {
      if (stem.endsWith("_" + k) || stem === k) { anim = k; break; }
    }
    frames.push({ name, x: +fm[1], y: +fm[2], w: +fm[3], h: +fm[4], anim });
  }
  frames.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return frames;
}

function groupAnims(frames) {
  const o = {};
  for (const f of frames) (o[f.anim] ||= []).push(f);
  return o;
}

function scale2x(src) {
  const w = src.width, h = src.height;
  const s = new Uint32Array(src.data.buffer);
  const dw = w * 2, dh = h * 2;
  const out = new ImageData(dw, dh);
  const d = new Uint32Array(out.data.buffer);
  for (let y = 0; y < h; y++) {
    const up = (y > 0 ? y - 1 : 0) * w;
    const mid = y * w;
    const dn = (y < h - 1 ? y + 1 : h - 1) * w;
    for (let x = 0; x < w; x++) {
      const P = s[mid + x];
      const A = s[up + x];
      const B = s[mid + (x < w - 1 ? x + 1 : w - 1)];
      const C = s[mid + (x > 0 ? x - 1 : 0)];
      const D = s[dn + x];
      let e0 = P, e1 = P, e2 = P, e3 = P;
      if (C === A && C !== D && A !== B) e0 = A;
      if (A === B && A !== C && B !== D) e1 = B;
      if (D === C && D !== B && C !== A) e2 = C;
      if (B === D && B !== A && D !== C) e3 = D;
      const o = y * 2 * dw + x * 2;
      d[o] = e0; d[o + 1] = e1; d[o + dw] = e2; d[o + dw + 1] = e3;
    }
  }
  return out;
}

const imgCache = new Map();
async function loadImg(url) {
  if (imgCache.has(url)) return imgCache.get(url);
  const job = (async () => {
    const blob = await (await fetch(url)).blob();
    return createImageBitmap(blob);
  })();
  imgCache.set(url, job);
  return job;
}

let LAYOUT = null;
async function layout() {
  if (LAYOUT) return LAYOUT;
  LAYOUT = await (await fetch(CHROME + "/LAYOUT.json")).json();
  return LAYOUT;
}

function artBox(L, faction) {
  return (L.factionArt && L.factionArt[faction]) || L.art;
}

function ink(img, fr) {
  const w = Math.max(1, Math.round(fr.w)), h = Math.max(1, Math.round(fr.h));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.imageSmoothingEnabled = false;
  x.drawImage(img, fr.x, fr.y, fr.w, fr.h, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let i = 0; i < w; i++) {
      if (d[(y * w + i) * 4 + 3] > 12) {
        if (i < x0) x0 = i;
        if (i > x1) x1 = i;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < x0) return { img, ...fr, canvas: c };
  const cut = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  const o = document.createElement("canvas");
  o.width = cut.w; o.height = cut.h;
  const oc = o.getContext("2d", { willReadFrequently: true });
  oc.imageSmoothingEnabled = false;
  oc.drawImage(c, cut.x, cut.y, cut.w, cut.h, 0, 0, cut.w, cut.h);
  let data = oc.getImageData(0, 0, cut.w, cut.h);
  if (Math.max(cut.w, cut.h) < 96) {
    data = scale2x(data);
    o.width = data.width; o.height = data.height;
    oc.putImageData(data, 0, 0);
  }
  return { canvas: o, w: o.width, h: o.height };
}

function strokeText(ctx, s, x, y, size, weight = "700") {
  ctx.font = `${weight} ${size}px ${CARD_FONT}`;
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.strokeStyle = "#120a06";
  ctx.lineWidth = Math.max(2.6, size / 3.2);
  ctx.fillStyle = "#fff4d6";
  ctx.strokeText(s, x, y);
  ctx.fillText(s, x, y);
}

function fitName(ctx, text, maxW, size) {
  let s = size;
  const str = String(text || "");
  ctx.font = `700 ${s}px ${CARD_FONT}`;
  while (s > 8 && ctx.measureText(str).width > maxW) {
    s -= 0.4;
    ctx.font = `700 ${s}px ${CARD_FONT}`;
  }
  return s;
}

function wrapLine(ctx, text, maxW) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (ctx.measureText(next).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

function gem(ctx, cx, cy, r, fill, n) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = "#120a06";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  strokeText(ctx, String(n), cx, cy + 0.5, 17);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

const packs = new Map();

async function loadDuelyst(card) {
  const id = card.duelystId || String(card.id).replace(/^duelyst:/, "");
  const [img, xml] = await Promise.all([
    loadImg(card.sheet || card.image),
    fetch(card.plist).then((r) => r.text()),
  ]);
  const anims = groupAnims(parsePlist(xml));
  const idle = (anims.idle || anims.breathing || anims.attack || Object.values(anims)[0] || [])[0];
  return { img, idle, kind: "plist" };
}

async function loadGw(card) {
  const img = await loadImg(card.image);
  const w = img.width, h = img.height;
  const cell = Math.min(w, h);
  const cols = w >= h ? Math.max(1, Math.round(w / cell)) : 1;
  const fw = w / cols;
  return { img, idle: { x: 0, y: 0, w: fw, h }, kind: "strip" };
}

export async function paintCard(canvas, card) {
  await ensureFonts();
  const L = await layout();
  const fac = card.faction === "grudawars" ? "neutral" : (card.faction || "neutral");
  const art = artBox(L, fac);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(SX, 0, 0, SX, 0, 0);
  ctx.clearRect(0, 0, CW, CH);
  ctx.fillStyle = "#100c16";
  ctx.fillRect(0, 0, CW, CH);

  const bgUrl = card.chromeBg || `${CHROME}/backgrounds/${fac}.png`;
  const frUrl = card.chromeFrame || `${CHROME}/frames/${fac}.png`;
  const [bg, frame] = await Promise.all([loadImg(bgUrl).catch(() => null), loadImg(frUrl).catch(() => null)]);
  if (bg) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(bg, art.x, art.y, art.w, art.h);
    ctx.imageSmoothingEnabled = false;
  }

  try {
    const pack = card.tab === "grudawars" ? await loadGw(card) : await loadDuelyst(card);
    const fr = pack.idle || { x: 0, y: 0, w: pack.img.width, h: pack.img.height };
    const cut = ink(pack.img, fr);
    ctx.save();
    ctx.beginPath();
    ctx.rect(art.x, art.y, art.w, art.h);
    ctx.clip();
    const s = Math.min(art.w / cut.w, art.h / cut.h);
    const dw = cut.w * s, dh = cut.h * s;
    const dx = art.x + (art.w - dw) / 2;
    const dy = art.y + (art.h - dh) / 2;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cut.canvas, dx, dy, dw, dh);
    ctx.restore();
  } catch {
    /* sheet still paints behind the frame */
  }

  if (frame) ctx.drawImage(frame, 0, 0, CW, CH);
  const st = L.stats || {};
  const fonts = L.fonts || {};
  const nameBox = L.name || { x: 10, y: 6, w: 148, h: 24, size: 14 };
  const title = String(card.name || "");
  const nameSize = fitName(ctx, title, nameBox.w - 4, nameBox.size || fonts.name || 14);
  ctx.textBaseline = "middle";
  strokeText(ctx, title, nameBox.x + 2, nameBox.y + nameBox.h / 2, nameSize);
  ctx.textBaseline = "alphabetic";

  const ribbon = L.ribbon || { x: 16, y: 164, w: 163, h: 32 };
  const kind = [card.tab, card.rarity, card.role || card.class].filter(Boolean).join(" · ").toUpperCase();
  const body = String(card.description || (card.abilities || []).join(" · ") || "");
  ctx.font = `400 ${fonts.body || 10}px ${CARD_FONT}`;
  ctx.fillStyle = "#2a2218";
  ctx.textBaseline = "top";
  const lines = wrapLine(ctx, body || kind, ribbon.w - 6);
  lines.forEach((ln, i) => {
    ctx.fillText(ln, ribbon.x + 3, ribbon.y + 4 + i * 11);
  });
  ctx.textBaseline = "alphabetic";

  if (st.cost) gem(ctx, st.cost.cx, st.cost.cy, st.cost.r || 14, "#3a7bd9", card.cost ?? 0);
  if (st.attack) gem(ctx, st.attack.cx, st.attack.cy, st.attack.r || 15, "#c9a227", card.attack ?? 0);
  if (st.health) gem(ctx, st.health.cx, st.health.cy, st.health.r || 15, "#2f9e4f", card.health ?? 0);
}

export function observeAlbum(root) {
  const io = new IntersectionObserver((ents) => {
    for (const e of ents) {
      if (!e.isIntersecting) continue;
      const cv = e.target;
      const card = cv._card;
      if (!card || cv._painted) continue;
      cv._painted = true;
      paintCard(cv, card).catch(() => { cv._painted = false; });
    }
  }, { root: null, rootMargin: "120px" });
  root.querySelectorAll("canvas.face").forEach((cv) => io.observe(cv));
  return io;
}
