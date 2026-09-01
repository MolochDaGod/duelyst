/**
 * Static preview server for the Codex — serves the repo as the deployed site
 * would (catalog/, api/, tcg-chrome/, runtime/), proxying binaries to the CDN.
 *
 * Run: node lab/tools/preview.mjs   → http://127.0.0.1:8788
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = Number(process.env.PORT || 8788);
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".plist": "application/xml",
  ".css": "text/css",
};

const PROXY = [
  ["/duelyst/", "https://assets.grudge-studio.com/sprites/duelyst/"],
  ["/gw/", "https://assets.grudge-studio.com/sprites/grudawars/"],
  ["/card-art/", "https://battle.thc-labz.xyz/card-art/"],
  ["/info-vfx/", "https://info.grudge-studio.com/"],
  // Baked catalogs point straight at the CDN; mirror it so loopback previews
  // are not blocked by CORS.
  ["/cdn/", "https://assets.grudge-studio.com/"],
];

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let p = decodeURIComponent(url.pathname);

  for (const [prefix, base] of PROXY) {
    if (p.startsWith(prefix)) {
      try {
        const up = await fetch(base + p.slice(prefix.length));
        const buf = Buffer.from(await up.arrayBuffer());
        res.writeHead(up.status, {
          "content-type": up.headers.get("content-type") || "application/octet-stream",
          "access-control-allow-origin": "*",
        });
        return res.end(buf);
      } catch (e) {
        res.writeHead(502); return res.end(String(e));
      }
    }
  }

  if (p === "/" || p === "/rpg-maker-studio") p = "/index.html";
  // The Codex uses the lab endpoints when served from loopback.
  if (p === "/api/catalog" || p === "/api/duelyst") {
    const src = p === "/api/catalog" ? "catalog/catalog.json" : "catalog/duelyst-index.json";
    const body = fs.readFileSync(path.join(ROOT, src), "utf8")
      .replaceAll("https://assets.grudge-studio.com/", "/cdn/")
      .replaceAll("https://battle.thc-labz.xyz/card-art/", "/card-art/");
    res.writeHead(200, { "content-type": MIME[".json"], "access-control-allow-origin": "*" });
    return res.end(body);
  }
  const file = path.join(ROOT, p.replace(/^\/+/, ""));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { "content-type": "text/plain" });
    return res.end("not found " + p);
  }
  res.writeHead(200, {
    "content-type": MIME[path.extname(file)] || "application/octet-stream",
    "access-control-allow-origin": "*",
  });
  res.end(fs.readFileSync(file));
}).listen(PORT, "127.0.0.1", () => console.log(`codex preview http://127.0.0.1:${PORT}`));
