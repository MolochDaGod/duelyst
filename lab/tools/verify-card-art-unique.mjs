/**
 * Flag cards that ship the *same* artwork as another card.
 *
 * Duplicate portraits read as a bug in a codex — two different opponents with
 * identical art — but the duplication can live upstream in the source assets
 * rather than in our wiring, so this hashes the actual bytes each card renders
 * and reports the groups. Sprite sheets are shared on purpose by re-skins
 * (BadBudz reuses Duelyst sheets), so only portrait-style art is checked.
 *
 * Run: node lab/tools/verify-card-art-unique.mjs [--roles portrait]
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "../..");

const argv = process.argv.slice(2);
const arg = (n, fb) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : fb;
};
const roles = String(arg("roles", "portrait")).split(",");
const CONCURRENCY = Number(arg("concurrency", 8));

const registry = JSON.parse(fs.readFileSync(path.join(ROOT, "catalog/cards.json"), "utf8"));

const targets = [];
for (const c of registry.cards) {
  for (const a of c.art || []) {
    if (roles.includes(a.role)) targets.push({ url: a.url, card: c });
  }
}

const byHash = new Map();
let done = 0;
const queue = [...targets];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) {
    const t = queue.pop();
    try {
      const r = await fetch(t.url);
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      const h = crypto.createHash("md5").update(buf).digest("hex").slice(0, 12);
      if (!byHash.has(h)) byHash.set(h, []);
      byHash.get(h).push(t);
    } catch { /* network flake — verify-art-urls.mjs owns reachability */ }
    if (++done % 50 === 0) process.stdout.write(`  ${done}/${targets.length}\r`);
  }
}));

const dupes = [...byHash.entries()].filter(([, v]) => v.length > 1);
console.log(`checked ${targets.length} images (roles: ${roles.join(",")})`);
console.log(`unique  ${byHash.size}`);
console.log(`repeated ${dupes.length} group(s) covering ${dupes.reduce((a, [, v]) => a + v.length, 0)} cards`);
for (const [h, v] of dupes) {
  console.log(`\n  ${h}`);
  for (const t of v) {
    console.log(`    ${String(t.card.source).padEnd(10)} ${String(t.card.faction).padEnd(14)} ${t.card.name}`);
  }
  console.log(`    ${v[0].url}`);
}

fs.writeFileSync(path.join(here, "art-dupe-report.json"), JSON.stringify({
  checked: targets.length,
  unique: byHash.size,
  groups: dupes.map(([hash, v]) => ({
    hash,
    url: v[0].url,
    cards: v.map((t) => ({ uuid: t.card.uuid, name: t.card.name, source: t.card.source })),
  })),
}, null, 1));
console.log("\nreport → lab/tools/art-dupe-report.json");
process.exit(dupes.length ? 1 : 0);
