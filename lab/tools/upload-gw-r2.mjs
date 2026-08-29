/**
 * Upload GrudaWars hero clip PNGs to R2 sprites/grudawars/
 * Catalog clips only (~5MB). Not a player bag.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SIG = pathToFileURL("F:/GitHub/ObjectStore/scripts/lib/r2-s3-sigv4.mjs").href;
const { listR2Objects, putR2Object } = await import(SIG);
const CAT = JSON.parse(fs.readFileSync("D:/Games/Models/_extract/rpg-maker-studio/catalog.json", "utf8"));
const GW = "F:/GitHub/GrudgeWars/public/sprites";
const dry = process.argv.includes("--dry-run");
const CONCURRENCY = 8;

const listed = await listR2Objects({ prefix: "sprites/grudawars/", max: 5000 });
const have = new Set(listed.keys.map((k) => k.key));
const jobs = [];
for (const h of CAT.heroes || []) {
  for (const url of Object.values(h.clips || {})) {
    const rel = String(url).replace(/^\/gw\//, "").replace(/\\/g, "/");
    const file = path.join(GW, rel);
    const key = "sprites/grudawars/" + rel;
    if (!fs.existsSync(file) || have.has(key)) continue;
    jobs.push({ key, file });
  }
}
console.log("existing", have.size, "to upload", jobs.length, "dry", dry);
if (dry) process.exit(0);

let i = 0, ok = 0, fail = 0;
async function worker() {
  while (i < jobs.length) {
    const job = jobs[i++];
    try {
      await putR2Object({ key: job.key, body: fs.readFileSync(job.file), contentType: "image/png" });
      ok++;
    } catch (err) {
      fail++;
      console.error("fail", job.key, err.message);
    }
    if ((ok + fail) % 40 === 0) console.log("progress", ok + fail, "/", jobs.length);
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));
console.log("done", { ok, fail });
