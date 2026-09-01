/**
 * Exercise the /v1/cards worker routes against the generated D1 seed,
 * using node:sqlite as a stand-in for the D1 binding.
 *
 * Run: node lab/tools/test-card-api.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import worker from "../../../ObjectStore/workers/src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const SEED = path.resolve(here, "../../../ObjectStore/workers/seed/grudge-cards.sql");

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(fs.readFileSync(SEED, "utf8"));

/** Minimal D1 shim over node:sqlite — prepare/bind/first/all/run. */
const DB = {
  prepare(sql) {
    let args = [];
    // D1 supports ?1 style; node:sqlite wants named or positional — expand ?1.
    const numbered = [...sql.matchAll(/\?(\d+)/g)].map((m) => Number(m[1]));
    const stmt = {
      bind(...a) { args = a; return stmt; },
      _rows() {
        const bound = numbered.length
          ? numbered.map((i) => args[i - 1])
          : args;
        return sqlite.prepare(sql.replace(/\?\d+/g, "?")).all(...bound);
      },
      async first() { return stmt._rows()[0] ?? null; },
      async all() { return { results: stmt._rows() }; },
    };
    return stmt;
  },
};

const env = { DB, ALLOWED_ORIGINS: "*" };
let fails = 0;

async function get(pathname) {
  const res = await worker.fetch(
    new Request(`https://objectstore.grudge-studio.com${pathname}`),
    env,
  );
  const body = await res.json();
  return { status: res.status, body };
}

function check(label, cond, detail) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  " + detail : ""}`);
  if (!cond) fails += 1;
}

const stats = await get("/v1/cards/stats");
check("stats 200", stats.status === 200, JSON.stringify(stats.body.bySource));
check("stats total 854", stats.body.total === 854, String(stats.body.total));
check("stats art 5404", stats.body.artTotal === 5404, String(stats.body.artTotal));
check("stats clips 4882", stats.body.clipTotal === 4882, String(stats.body.clipTotal));
check("stats frames 55440", stats.body.frameTotal === 55440, String(stats.body.frameTotal));

const list = await get("/v1/cards?limit=3");
check("list 200", list.status === 200);
check("list paging", list.body.total === 854 && list.body.count === 3 && list.body.hasMore);
check("list hydrated", Array.isArray(list.body.cards[0].keywords));

const filtered = await get("/v1/cards?source=duelyst&faction=lyonar&limit=2");
check("filter faction", filtered.body.cards.every((c) => c.faction === "lyonar"),
  `${filtered.body.total} lyonar`);

const search = await get("/v1/cards?q=Andromeda");
check("search by name", search.body.total >= 1, search.body.cards[0]?.name);

const uuid = search.body.cards[0].uuid;
const one = await get(`/v1/cards/${uuid}`);
check("get by uuid", one.status === 200 && one.body.uuid === uuid);
check("get includes art", one.body.art.length > 0, `${one.body.art.length} assets`);
check("art urls absolute", one.body.art.every((a) => a.url.startsWith("https://")));

const bySlug = await get("/v1/cards/boss_andromeda");
check("get by slug", bySlug.status === 200 && bySlug.body.uuid === uuid);

const byKey = await get(`/v1/cards/${encodeURIComponent("duelyst:boss_andromeda")}`);
check("get by source_key", byKey.status === 200 && byKey.body.uuid === uuid);

const art = await get(`/v1/cards/${uuid}/art`);
check("art endpoint", art.status === 200 && art.body.count === one.body.art.length);
check("art has chrome", art.body.art.some((a) => a.role === "background")
  && art.body.art.some((a) => a.role === "frame"));

const facets = await get("/v1/cards/factions");
check("factions facet", facets.status === 200 && facets.body.values.length > 5,
  `${facets.body.values.length} factions`);

const withArt = await get("/v1/cards?limit=2&art=1");
check("list art=1", withArt.body.cards.every((c) => Array.isArray(c.art) && c.art.length));

const missing = await get("/v1/cards/does-not-exist");
check("404 unknown card", missing.status === 404);

// ── animation clips: the source has 4334 backed clips / 55350 frames ──
const clips = await get(`/v1/cards/${uuid}/clips`);
check("clips endpoint", clips.status === 200 && clips.body.count > 0,
  `${clips.body.count} clips / ${clips.body.frameTotal} frames`);
check("clips have frame counts", clips.body.clips.every((c) => c.frames > 0));
check("clips have sheet rects", clips.body.clips.every((c) => c.first && c.first.w > 0));
check("clips expose the sheet", clips.body.sheet?.endsWith(".png") && clips.body.plist?.endsWith(".plist"));
check("idle loops", clips.body.clips.find((c) => c.name === "idle")?.loop === true);

check("card includes clips", one.body.clips?.length === clips.body.count);
check("card clipCount matches", one.body.clipCount === clips.body.count,
  `${one.body.clipCount} vs ${clips.body.count}`);
check("card frameTotal matches", one.body.frameTotal === clips.body.frameTotal);

const clipFacets = await get("/v1/cards/clips");
check("clip facet", clipFacets.status === 200 && clipFacets.body.values.length > 5,
  clipFacets.body.values.map((v) => v.value).join(","));
check("clip facet frames", clipFacets.body.frameTotal === 55440, String(clipFacets.body.frameTotal));

const projectiles = await get("/v1/cards?clip=projectile&limit=100");
check("filter by clip", projectiles.body.total > 0 && projectiles.body.total < 854,
  `${projectiles.body.total} units with a projectile clip`);

const casters = await get("/v1/cards?clip=castloop&limit=5&clips=1");
check("filter by cast clip", casters.body.total > 0, `${casters.body.total} casters`);
check("list clips=1", casters.body.cards.every((c) => Array.isArray(c.clips) && c.clips.length));

// vfx sprites (slash / burst / projectile effects) must be in the art set
const vfxArt = art.body.art.filter((a) => a.role.startsWith("vfx:"));
check("art includes vfx", vfxArt.length > 0, vfxArt.map((a) => a.role).join(","));
check("vfx urls absolute", vfxArt.every((a) => a.url.startsWith("https://")));

const root = await get("/");
check("root advertises cards", !!root.body.endpoints.cards);
check("root advertises clips", !!root.body.endpoints.cardClips);

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
