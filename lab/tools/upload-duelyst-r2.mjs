/**
 * Upload Duelyst PNG + plist + TCG chrome to R2 bucket grudge-assets.
 * Uses existing ObjectStore SigV4 helper (not wrangler per-file).
 * Not player bag. Idempotent: skips keys already on R2.
 *
 *   node D:\Games\Models\_extract\duelyst\tools\upload-duelyst-r2.mjs --dry-run
 *   node D:\Games\Models\_extract\duelyst\tools\upload-duelyst-r2.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SIG = pathToFileURL("F:/GitHub/ObjectStore/scripts/lib/r2-s3-sigv4.mjs").href;
const { listR2Objects, putR2Object } = await import(SIG);

const DUEL = path.resolve(here, "..");
const UNITS = path.join(DUEL, "Duelyst-Sprites/Spritesheets/Units");
const PLISTS = path.join(DUEL, "Duelyst-Sprites/Scripts/XMLS");
const CHROME = path.join(DUEL, "tcg-chrome");
const INDEX = path.join(DUEL, "../rpg-maker-studio/dist/catalog/duelyst-index.json");
const dry = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");
const limit = Number((process.argv.find((a) => a.startsWith("--limit=")) || "").split("=")[1] || 0);
const CONCURRENCY = Number((process.argv.find((a) => a.startsWith("--concurrency=")) || "").split("=")[1] || 8);

function mimeFor(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".json") return "application/json";
  if (ext === ".plist" || ext === ".xml") return "application/xml";
  if (ext === ".md") return "text/markdown";
  return "application/octet-stream";
}

function relHasSrc(p) {
  return /(?:^|[\\/])_src(?:_|[\\/])/i.test(p);
}

function walkFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkFiles(p));
    else if (ent.isFile() && !/\.(psd|ai|sketch)$/i.test(ent.name) && !relHasSrc(p)) out.push(p);
  }
  return out;
}

function collectJobs() {
  const jobs = [];
  for (const f of fs.readdirSync(UNITS).filter((x) => x.toLowerCase().endsWith(".png"))) {
    const id = f.replace(/\.png$/i, "");
    jobs.push({ key: `sprites/duelyst/units/${id}.png`, file: path.join(UNITS, f) });
  }
  for (const f of fs.readdirSync(PLISTS).filter((x) => x.toLowerCase().endsWith(".plist"))) {
    const id = f.replace(/\.plist$/i, "");
    jobs.push({ key: `sprites/duelyst/plists/${id}.plist`, file: path.join(PLISTS, f) });
  }
  if (fs.existsSync(CHROME)) {
    for (const file of walkFiles(CHROME)) {
      const rel = path.relative(CHROME, file).replace(/\\/g, "/");
      jobs.push({ key: `sprites/duelyst/tcg-chrome/${rel}`, file });
    }
  }
  if (fs.existsSync(INDEX)) {
    jobs.push({ key: "sprites/duelyst/index.json", file: INDEX });
  }
  return jobs;
}

async function pool(items, n, fn) {
  let i = 0;
  let ok = 0;
  let fail = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const job = items[i++];
      try {
        await fn(job);
        ok += 1;
      } catch (err) {
        fail += 1;
        console.error("fail", job.key, err.message || err);
      }
      const done = ok + fail;
      if (done % 50 === 0 || done === items.length) {
        console.log("progress", done, "/", items.length, "ok", ok, "fail", fail);
      }
    }
  });
  await Promise.all(workers);
  return { ok, fail };
}

const listed = await listR2Objects({ prefix: "sprites/duelyst/", max: 5000 });
const have = new Set(listed.keys.map((k) => k.key));
console.log("r2 existing", have.size, "prefix sprites/duelyst/");

let jobs = collectJobs();
console.log("local jobs", jobs.length);
if (!force) jobs = jobs.filter((j) => !have.has(j.key));
if (limit) jobs = jobs.slice(0, limit);
console.log("to upload", jobs.length, "dry", dry, "force", force);

if (dry) {
  console.log("sample", jobs.slice(0, 8).map((j) => j.key));
  process.exit(0);
}

const result = await pool(jobs, CONCURRENCY, async (job) => {
  const body = fs.readFileSync(job.file);
  await putR2Object({ key: job.key, body, contentType: mimeFor(job.file) });
});
console.log("done", result, "skipped-existing", have.size);
