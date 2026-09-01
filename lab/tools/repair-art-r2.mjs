/**
 * Repair Duelyst art on R2 that returns 200 but holds the wrong bytes.
 *
 * A failed upload can leave an HTML error page stored under a .png key; the
 * CDN then serves it as image/png and the browser fails to decode. The normal
 * uploader skips keys that already exist, so those never self-heal.
 *
 * Reads lab/tools/art-url-report.json (from verify-art-urls.mjs), re-uploads
 * each broken key from the extracted source, then re-verifies.
 *
 *   node lab/tools/repair-art-r2.mjs --dry-run
 *   node lab/tools/repair-art-r2.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SIG = pathToFileURL("F:/GitHub/ObjectStore/scripts/lib/r2-s3-sigv4.mjs").href;
const SRC = process.env.DUELYST_SRC || "D:/Games/Models/_extract/duelyst";
const UNITS = path.join(SRC, "Duelyst-Sprites/Spritesheets/Units");
const PLISTS = path.join(SRC, "Duelyst-Sprites/Scripts/XMLS");
const REPORT = path.join(here, "art-url-report.json");
const dry = process.argv.includes("--dry-run");

if (!fs.existsSync(REPORT)) {
  console.error("no art-url-report.json — run: node lab/tools/verify-art-urls.mjs --roles sheet,plist");
  process.exit(1);
}
const report = JSON.parse(fs.readFileSync(REPORT, "utf8"));

/** Only assets we hold locally can be repaired; portraits live in another repo. */
function localFor(entry) {
  const url = new URL(entry.url);
  if (!url.host.endsWith("grudge-studio.com")) return null;
  const key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  if (entry.role === "sheet") {
    const f = path.join(UNITS, path.basename(key));
    return fs.existsSync(f) ? { key, file: f, type: "image/png" } : null;
  }
  if (entry.role === "plist") {
    const base = path.basename(key);
    // "x copy.plist" duplicates have no source file; fall back to the base unit.
    const candidates = [base, base.replace(/ copy\.plist$/i, ".plist")];
    for (const c of candidates) {
      const f = path.join(PLISTS, c);
      if (fs.existsSync(f)) return { key, file: f, type: "application/xml" };
    }
  }
  return null;
}

const jobs = [];
const skipped = [];
for (const b of report.broken || []) {
  const j = localFor(b);
  if (j) jobs.push({ ...j, card: b.card, role: b.role, was: b.kind });
  else skipped.push(b);
}

console.log(`broken in report ${(report.broken || []).length}`);
console.log(`repairable       ${jobs.length}`);
console.log(`not repairable   ${skipped.length} (no local source — e.g. external card art)`);
for (const j of jobs) console.log(`  ${j.role.padEnd(7)} ${j.card.padEnd(28)} ${j.was} -> ${path.basename(j.file)}`);

if (dry || !jobs.length) {
  if (!jobs.length) console.log("nothing to repair");
  process.exit(0);
}

const { putR2Object } = await import(SIG);
const { loadFleetEnv } = await import(pathToFileURL("F:/GitHub/ObjectStore/scripts/lib/load-fleet-env.mjs").href);
loadFleetEnv({ quiet: true });

let ok = 0;
const urls = [];
for (const j of jobs) {
  const body = fs.readFileSync(j.file);
  await putR2Object({ key: j.key, body, contentType: j.type });
  ok += 1;
  urls.push(`https://assets.grudge-studio.com/${j.key.split("/").map(encodeURIComponent).join("/")}`);
  console.log(`uploaded ${j.key} (${body.length} bytes)`);
}

// The bad bytes are also in the Cloudflare edge cache; without a purge the CDN
// keeps serving the HTML for the full 30-day max-age even though R2 is correct.
// Fleet env holds several Cloudflare tokens with different scopes, so try each
// until one is allowed to purge.
const zones = [process.env.CLOUDFLARE_ZONE_ID, process.env.CF_ZONE_ID].filter(Boolean);
const tokens = ["CF_TOKEN_HELPER", "CLOUDFLARE_API_TOKEN", "CF_WORKER_R2_API", "CF_AI_WORKERS_API"]
  .map((k) => [k, process.env[k]]).filter(([, v]) => v);
let purged = false;
for (const [name, token] of tokens) {
  for (const zone of [...new Set(zones)]) {
    const r = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone}/purge_cache`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ files: urls }),
    });
    const j = await r.json().catch(() => ({}));
    if (j.success) { console.log(`cache purge: ok (${name})`); purged = true; break; }
  }
  if (purged) break;
}
if (!purged) console.warn("cache purge FAILED — edge will serve stale bytes until max-age expires");

// Re-verify straight from the CDN so a silent failure cannot pass.
console.log("\nre-verifying…");
let stillBad = 0;
for (const j of jobs) {
  const url = `https://assets.grudge-studio.com/${j.key.split("/").map(encodeURIComponent).join("/")}`;
  const r = await fetch(`${url}?cb=${Date.now()}`, { cache: "no-store" });
  const buf = Buffer.from(await r.arrayBuffer());
  const isPng = buf[0] === 0x89 && buf[1] === 0x50;
  const isXml = buf.slice(0, 5).toString() === "<?xml";
  const good = j.type === "image/png" ? isPng : isXml;
  console.log(`  ${good ? "OK  " : "BAD "} ${j.key} ${buf.length} bytes`);
  if (!good) stillBad += 1;
}
console.log(`\nrepaired ${ok}, still bad ${stillBad}`);
process.exit(stillBad ? 1 : 0);
