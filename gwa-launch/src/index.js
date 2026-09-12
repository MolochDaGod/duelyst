/**
 * gwa.grudge-studio.com — GameWithAll Battle DAO launch + card directory.
 * Definitions only. Ownership stays Railway user_cards (Dope-Budz pack open).
 */
const CODEX = "https://duelyst.grudge-studio.com";
const SHOP = "https://dope-budz-production.up.railway.app";
const CDN_D = "https://assets.grudge-studio.com/sprites/duelyst";
const CDN_G = "https://assets.grudge-studio.com/sprites/grudawars";

const INFO = {
  id: "gamewithall",
  name: "GameWithAll Battle DAO",
  host: "https://gwa.grudge-studio.com",
  notPlayerBag: true,
  ownership: "Railway user_cards",
  pack: {
    id: "gamewithall-pack",
    name: "GameWithAll Pack",
    cardsPerPack: 3,
    tabs: ["duelyst", "grudawars"],
    price: { budz: 80, gbux: 80, sol: 0.4 },
    shop: `${SHOP}/api/clash/shop/packs`,
  },
  play: "https://thc-labz-battle.vercel.app/library",
  codex: CODEX,
  wallet: "https://wallet.grudge-studio.com",
  idLogin: "https://id.grudge-studio.com/login",
  orbisLaunch: "https://www.orbisonsol.io/launch",
  tokenStandard: "cNFT",
};

function cors(extra = {}) {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "Content-Type, Authorization",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=60",
    "x-gwa": "gwa-launch",
    ...extra,
  };
}

function json(data, status = 200, extra) {
  return new Response(JSON.stringify(data), { status, headers: cors(extra) });
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "user-agent": "gwa-launch" } });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

function rarityForDuelyst(u) {
  const role = String(u.role || "").toLowerCase();
  const cost = Number(u.cost ?? 3);
  if (role.includes("general") || role === "boss") return "legendary";
  if (role.includes("legendary")) return "legendary";
  if (role.includes("structure") || role.includes("build")) return "rare";
  if (cost >= 6) return "epic";
  if (cost >= 4) return "rare";
  if (cost >= 3) return "uncommon";
  return "common";
}

function mapDuelyst(u) {
  const id = String(u.id || "");
  return {
    id: `duelyst:${id}`,
    name: u.name || id,
    tab: "duelyst",
    cardSet: "duelyst",
    faction: u.faction || "neutral",
    role: u.role || "minion",
    rarity: rarityForDuelyst(u),
    cost: Number(u.cost ?? 0),
    attack: Number(u.attack ?? 0),
    health: Number(u.health ?? 0),
    image: u.sheet || `${CDN_D}/units/${id}.png`,
    plist: u.plist || `${CDN_D}/plists/${id}.plist`,
  };
}

function mapGw(h) {
  const slug = String(h.id || "").replace(/^gw_/, "");
  const idle = h.clips?.idle || `${CDN_G}/${slug}/idle.png`;
  const name = String(h.name || slug).replace(/[-_]+/g, " ");
  return {
    id: `grudawars:${slug}`,
    name: name.replace(/\b\w/g, (c) => c.toUpperCase()),
    tab: "grudawars",
    cardSet: "grudawars",
    faction: "grudawars",
    role: "hero",
    rarity: /boss|dragon|cthulu/i.test(slug) ? "legendary" : "uncommon",
    cost: 3,
    attack: 3,
    health: 4,
    image: idle,
  };
}

async function directory(tab) {
  const t = String(tab || "all").toLowerCase();
  const [idx, cat] = await Promise.all([
    fetchJson(`${CODEX}/catalog/duelyst-index.json`),
    fetchJson(`${CODEX}/catalog/catalog.json`),
  ]);
  const duelyst = (idx.units || []).map(mapDuelyst);
  const grudawars = (cat.heroes || []).map(mapGw);
  const cards =
    t === "duelyst" ? duelyst : t === "grudawars" ? grudawars : [...duelyst, ...grudawars];
  return {
    success: true,
    notPlayerBag: true,
    tab: t === "grudawars" || t === "duelyst" ? t : "all",
    counts: { duelyst: duelyst.length, grudawars: grudawars.length, all: duelyst.length + grudawars.length },
    pack: INFO.pack,
    cards,
  };
}

function pick3(cards) {
  const pool = cards.slice();
  const out = [];
  for (let i = 0; i < 3 && pool.length; i++) {
    const n = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(n, 1)[0]);
  }
  return out;
}

async function handleApi(request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors() });
  }

  if (path === "/api/health") {
    return json({ ok: true, service: "gwa-launch", host: "gwa.grudge-studio.com" });
  }
  if (path === "/api/info" || path === "/api/v1/gamewithall") {
    return json(INFO);
  }
  if (path === "/api/directory" || path === "/api/cards") {
    try {
      const dir = await directory(url.searchParams.get("tab") || "all");
      return json(dir, 200, { "cache-control": "public, max-age=120" });
    } catch (e) {
      return json({ success: false, error: String(e.message || e) }, 502);
    }
  }
  if (path === "/api/packs") {
    let shop = null;
    try {
      shop = await fetchJson(`${SHOP}/api/clash/shop/packs`);
    } catch {
      shop = { success: false, packs: [INFO.pack] };
    }
    return json({
      success: true,
      featured: INFO.pack,
      packs: shop.packs || [INFO.pack],
    });
  }
  if (path === "/api/packs/preview" && request.method === "POST") {
    try {
      const dir = await directory("all");
      return json({ success: true, packId: "gamewithall-pack", cards: pick3(dir.cards) });
    } catch (e) {
      return json({ success: false, error: String(e.message || e) }, 502);
    }
  }
  if (path === "/api/packs/buy" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const upstream = await fetch(`${SHOP}/api/clash/shop/purchase`, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "gwa-launch" },
      body: JSON.stringify({
        walletAddress: body.walletAddress || body.wallet,
        packId: body.packId || "gamewithall-pack",
        paymentType: body.paymentType || "budz",
        openNow: body.openNow !== false,
      }),
    });
    const data = await upstream.json().catch(() => ({ success: false }));
    return json(data, upstream.status);
  }

  return json({ error: "not found", path }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request);
    return env.ASSETS.fetch(request);
  },
};
