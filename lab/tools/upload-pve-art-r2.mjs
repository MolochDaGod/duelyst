/** Upload Season 1 city PVE card-art PNGs to R2 sprites/thc-pve/. Not a bag. */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { flattenCityPve } from "../../rpg-maker-studio/pve-roster.mjs";

const SIG = pathToFileURL("F:/GitHub/ObjectStore/scripts/lib/r2-s3-sigv4.mjs").href;
const { listR2Objects, putR2Object } = await import(SIG);
const ART = "C:/Users/nugye/Documents/THC-Labz-Battle/THC-Labz-Battle/client/public/card-art";
const listed = await listR2Objects({ prefix: "sprites/thc-pve/", max: 500 });
const have = new Set(listed.keys.map((k) => k.key));
const jobs = [];
for (const c of flattenCityPve()) {
  const file = path.basename(c.image || "");
  const abs = path.join(ART, file);
  const key = "sprites/thc-pve/" + file;
  if (!file || !fs.existsSync(abs) || have.has(key)) continue;
  jobs.push({ key, file: abs });
}
console.log("existing", have.size, "upload", jobs.length);
let i = 0, ok = 0, fail = 0;
async function worker() {
  while (i < jobs.length) {
    const job = jobs[i++];
    try {
      await putR2Object({ key: job.key, body: fs.readFileSync(job.file), contentType: "image/png" });
      ok++;
    } catch (e) {
      fail++;
      console.error("fail", job.key, e.message);
    }
  }
}
await Promise.all(Array.from({ length: Math.min(8, jobs.length || 1) }, worker));
console.log("done", { ok, fail });
