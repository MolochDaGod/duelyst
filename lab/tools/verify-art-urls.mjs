/**
 * Verify every art URL in the registry actually serves the bytes it claims.
 *
 * R2 can hold a 200-with-HTML body (a failed upload) that still reports
 * content-type image/png — the browser then fails with "source image could not
 * be decoded". A HEAD request cannot catch this, so we read the magic bytes.
 *
 * Run: node lab/tools/verify-art-urls.mjs [--roles sheet,plist] [--concurrency 24]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "../..");

const argv = process.argv.slice(2);
const arg = (name, fb) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fb;
};
const roles = String(arg("roles", "sheet,plist,portrait,mint")).split(",");
const CONCURRENCY = Number(arg("concurrency", 24));

const registry = JSON.parse(fs.readFileSync(path.join(ROOT, "catalog/cards.json"), "utf8"));

const seen = new Set();
const targets = [];
for (const c of registry.cards) {
  for (const a of c.art || []) {
    if (!roles.includes(a.role) || seen.has(a.url)) continue;
    seen.add(a.url);
    targets.push({ url: a.url, role: a.role, card: c.slug });
  }
}

const PNG = [0x89, 0x50, 0x4e, 0x47];
function sniff(buf) {
  if (buf.length >= 4 && PNG.every((b, i) => buf[i] === b)) return "png";
  if (buf.length >= 12 && buf.slice(0, 4).toString("latin1") === "RIFF"
      && buf.slice(8, 12).toString("latin1") === "WEBP") return "webp";
  const head = buf.slice(0, 64).toString("utf8").trim().toLowerCase();
  if (head.startsWith("<!doctype html") || head.startsWith("<html")) return "html";
  if (head.startsWith("<?xml") || head.startsWith("<!doctype plist")) return "xml";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8) return "jpeg";
  return "unknown";
}

const IMAGE_KINDS = new Set(["png", "jpeg", "webp"]);

const bad = [];
let done = 0;

async function check(t) {
  try {
    const r = await fetch(t.url);
    const buf = Buffer.from(await r.arrayBuffer());
    const kind = sniff(buf);
    const wantImage = t.role !== "plist";
    const ok = r.ok && (wantImage ? IMAGE_KINDS.has(kind) : kind === "xml");
    if (!ok) {
      bad.push({ ...t, status: r.status, kind, bytes: buf.length,
        type: r.headers.get("content-type") });
    }
  } catch (e) {
    bad.push({ ...t, status: 0, kind: "error", error: e.message });
  }
  done += 1;
  if (done % 100 === 0) process.stdout.write(`  ${done}/${targets.length}\r`);
}

const queue = [...targets];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) await check(queue.pop());
}));

console.log(`checked ${targets.length} urls (roles: ${roles.join(",")})`);
console.log(`broken  ${bad.length}`);
for (const b of bad.slice(0, 60)) {
  console.log(`  ${b.role.padEnd(9)} ${b.card.padEnd(28)} ${b.status} ${b.kind.padEnd(7)} ${b.bytes ?? ""} ${b.url}`);
}
fs.writeFileSync(path.join(here, "art-url-report.json"),
  JSON.stringify({ checked: targets.length, broken: bad }, null, 1));
console.log("report → lab/tools/art-url-report.json");
process.exit(bad.length ? 1 : 0);
