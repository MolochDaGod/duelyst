/**
 * Node catalog for 2D RPG Maker / card showcase.
 * D1 target: Game-Studio-Tool gamedata_snapshots (2d/sprites, 2d/cards, 2d/fx).
 * Not a second bag. Live AI hub remains F:\\GitHub\\grudge-ai-hub.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clashAbility } from "../duelyst/clash-abilities.mjs";
import { kitOf, clipsFromPlistXml } from "../duelyst/runtime/DuelystSprite.js";
import { flattenCityPve } from "./pve-roster.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CATALOG = JSON.parse(fs.readFileSync(path.join(ROOT, "catalog.json"), "utf8"));
const GW = "F:/GitHub/GrudgeWars/public/sprites";
const DUEL = "D:/Games/Models/_extract/duelyst";
const BATTLE_ART = "C:/Users/nugye/Documents/THC-Labz-Battle/THC-Labz-Battle/client/public/card-art";
const BATTLE_FX = "C:/Users/nugye/Documents/THC-Labz-Battle/THC-Labz-Battle/client/public/effects";
const RPG = "F:/GitHub/Grudge-RPG-Sprite-Attack/client/public/fighter2d";
const PORT = Number(process.env.PORT || 8767);
const DUEL_CAT = JSON.parse(fs.readFileSync(path.join(DUEL, "catalog.json"), "utf8"));
const DUEL_HIER = fs.existsSync(path.join(DUEL, "hierarchy.json"))
  ? JSON.parse(fs.readFileSync(path.join(DUEL, "hierarchy.json"), "utf8"))
  : { units: [] };

function duelystIndex() {
  const hier = new Map((DUEL_HIER.units || []).map((u) => [u.id, u]));
  return (DUEL_CAT.units || []).map((u) => {
    const h = hier.get(u.id) || {};
    const slash = (p) => String(p || "").replace(/\\/g, "/");
    const rawName = h.name || u.id;
    const fac = h.faction || u.faction || "other";
    let name = String(rawName).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^(alt|tier2|3rd)(?=\w)/i, "$1 ");
    if (/general/i.test(name) && fac && fac !== "other" && !name.toLowerCase().includes(fac)) {
      name = fac[0].toUpperCase() + fac.slice(1) + " " + name;
    }
    const plistAbs = path.join(DUEL, u.plist || `Duelyst-Sprites/Scripts/XMLS/${u.id}.plist`);
    const clips = fs.existsSync(plistAbs)
      ? clipsFromPlistXml(fs.readFileSync(plistAbs, "utf8"))
      : (h.anims || []);
    const kits = kitOf(Object.fromEntries(clips.map((c) => [c, true])));
    const row = {
      id: u.id,
      name,
      faction: h.faction || u.faction || "other",
      role: h.role || "minion",
      anims: clips,
      clips,
      kits,
      hasCast: kits.includes("caster"),
      hasProjectile: kits.includes("projectile"),
      sheet: "/duelyst/" + slash(u.sheet),
      plist: "/duelyst/" + slash(u.plist),
    };
    const ab = clashAbility(row);
    return { ...row, ...ab, abilities: ab.keywords, abilityText: ab.text };
  });
}

function send(res, code, body, type = "application/json") {
  res.writeHead(code, {
    "content-type": type,
    "access-control-allow-origin": "*",
    "cache-control": "no-cache",
  });
  res.end(body);
}

function mime(p) {
  if (p.endsWith(".png")) return "image/png";
  if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
  if (p.endsWith(".html")) return "text/html; charset=utf-8";
  if (p.endsWith(".js")) return "text/javascript";
  if (p.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

function file(res, abs) {
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    send(res, 404, JSON.stringify({ error: abs }));
    return;
  }
  res.writeHead(200, {
    "content-type": mime(abs),
    "access-control-allow-origin": "*",
    "cache-control": "public, max-age=120",
  });
  fs.createReadStream(abs).on("error", () => {
    if (!res.headersSent) send(res, 404, JSON.stringify({ error: abs }));
    else res.end();
  }).pipe(res);
}

function aiQuery(q) {
  const s = String(q || "").toLowerCase();
  const heroes = (CATALOG.heroes || []).filter((h) =>
    h.name.toLowerCase().includes(s) || Object.keys(h.clips || {}).some((c) => c.includes(s) || s.includes(c))
  ).slice(0, 8);
  const cards = (CATALOG.cards || []).filter((c) =>
    String(c.name).toLowerCase().includes(s) ||
    (c.abilities || []).some((a) => String(a).toLowerCase().includes(s))
  ).slice(0, 8);
  const fx = (CATALOG.fxSample || []).filter((f) =>
    f.id.toLowerCase().includes(s) || f.kind.includes(s)
  ).slice(0, 8);
  return {
    q,
    use: "Local catalog worker. Production Legion is ai.grudge-studio.com (grudge-ai-hub).",
    heroes,
    cards,
    fx,
    hint: s.includes("projectile")
      ? "GrudaWars heroes with clip projectile + Duelyst 32 unit _projectile clips + Battle effects/roguelike/Projectiles"
      : "Ask for a hero, card ability, slash, fire, heal, or projectile.",
  };
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://127.0.0.1");
  const p = u.pathname;
  if (p === "/" || p === "/rpg-maker-studio") return file(res, path.join(ROOT, "showcase.html"));
  if (p === "/api/catalog") {
    const pve = flattenCityPve();
    return send(res, 200, JSON.stringify({
      heroCount: (CATALOG.heroes || []).length,
      duelystUnits: CATALOG.duelystUnitCount || CATALOG.duelystUnits,
      fxCount: CATALOG.fxCount,
      cardCount: pve.length || CATALOG.cardCount,
      d1: CATALOG.d1Target,
      heroes: CATALOG.heroes || [],
      cards: pve.length ? pve : (CATALOG.cards || []),
      cities: [...new Set(pve.map((c) => c.city))],
    }));
  }
  if (p === "/api/heroes") return send(res, 200, JSON.stringify(CATALOG.heroes || []));
  if (p === "/api/cards") {
    const pve = flattenCityPve();
    return send(res, 200, JSON.stringify(pve.length ? pve : (CATALOG.cards || [])));
  }
  if (p === "/api/hero-index") return send(res, 200, JSON.stringify(CATALOG.heroIndex || []));
  if (p === "/api/duelyst") {
    const units = duelystIndex();
    return send(res, 200, JSON.stringify({
      count: units.length,
      factions: DUEL_CAT.factions || DUEL_HIER.factions || {},
      roles: DUEL_HIER.roles || {},
      units,
    }));
  }
  if (p === "/api/ai") return send(res, 200, JSON.stringify(aiQuery(u.searchParams.get("q"))));
  if (p.startsWith("/gw/")) return file(res, path.join(GW, decodeURIComponent(p.slice(4))));
  if (p.startsWith("/runtime/")) return file(res, path.join(DUEL, "runtime", decodeURIComponent(p.slice(9))));
  if (p.startsWith("/duelyst/")) return file(res, path.join(DUEL, decodeURIComponent(p.slice(9))));
  if (p.startsWith("/card-art/")) return file(res, path.join(BATTLE_ART, decodeURIComponent(p.slice(10))));
  if (p.startsWith("/effects/")) return file(res, path.join(BATTLE_FX, decodeURIComponent(p.slice(9))));
  if (p.startsWith("/info-vfx/")) {
    const rel = decodeURIComponent(p.slice("/info-vfx/".length));
    const hosts = [
      "https://molochdagod.github.io/ObjectStore/",
      "https://info.grudge-studio.com/",
    ];
    (async () => {
      for (const host of hosts) {
        try {
          const r = await fetch(host + rel, { headers: { "user-agent": "Mozilla/5.0 GrudgeCodex" } });
          const buf = Buffer.from(await r.arrayBuffer());
          const ct = r.headers.get("content-type") || "";
          if (!r.ok || ct.includes("text/html")) continue;
          res.writeHead(r.status, {
            "content-type": ct || "application/octet-stream",
            "access-control-allow-origin": "*",
            "cache-control": "public, max-age=3600",
          });
          res.end(buf);
          return;
        } catch { /* try next host */ }
      }
      send(res, 502, JSON.stringify({ error: rel }));
    })();
    return;
  }
  if (p.startsWith("/rpg2d/")) return file(res, path.join(RPG, decodeURIComponent(p.slice(7))));
  if (p === "/catalog.json") return file(res, path.join(ROOT, "catalog.json"));
  const local = path.join(ROOT, p.replace(/^\//, ""));
  if (fs.existsSync(local) && fs.statSync(local).isFile()) return file(res, local);
  send(res, 404, JSON.stringify({ error: p }));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`rpg-maker-studio  http://127.0.0.1:${PORT}/rpg-maker-studio`);
  console.log(`AI worker         http://127.0.0.1:${PORT}/api/ai?q=slash`);
});
