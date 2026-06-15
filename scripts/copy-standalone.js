/**
 * Копирует public и .next/static в каталог standalone-приложения (рядом с server.js).
 * Генерирует start.js — точку входа для Timeweb (foreground, без npm/NestJS).
 */
const fs = require("fs");
const path = require("path");
const { getStandaloneAppDir } = require("./standalone-paths");

const root = path.join(__dirname, "..");
const info = getStandaloneAppDir(root);

if (!info) {
  console.warn("copy-standalone: server.js не найден в .next/standalone, пропуск.");
  process.exit(0);
}

const { appDir, serverPath } = info;
const publicDir = path.join(root, "public");
const staticDir = path.join(root, ".next", "static");
const destPublic = path.join(appDir, "public");
const destStatic = path.join(appDir, ".next", "static");
const destStart = path.join(appDir, "start.js");

const startJs = `'use strict';
const fs = require("fs");
const path = require("path");

if (!process.env.NEXT_CACHE_DIR) {
  process.env.NEXT_CACHE_DIR = "/tmp";
}
if (!process.env.HOSTNAME) {
  process.env.HOSTNAME = "0.0.0.0";
}

/** Next.js prerender cache ignores NEXT_CACHE_DIR and writes to .next/cache beside server.js. */
function linkWritableNextCache() {
  const cacheBase = process.env.NEXT_CACHE_DIR;
  const writable = path.join(cacheBase, "karto-next-prerender-cache");
  const nextDir = path.join(__dirname, ".next");
  const cachePath = path.join(nextDir, "cache");
  try {
    fs.mkdirSync(writable, { recursive: true });
    fs.mkdirSync(nextDir, { recursive: true });
    if (fs.existsSync(cachePath)) {
      const st = fs.lstatSync(cachePath);
      if (st.isSymbolicLink()) return;
      if (st.isDirectory()) {
        try {
          fs.rmSync(cachePath, { recursive: true, force: true });
        } catch {
          return;
        }
      }
    }
    fs.symlinkSync(writable, cachePath, "dir");
  } catch (e) {
    console.warn("[karto] prerender cache symlink:", e instanceof Error ? e.message : e);
  }
}

linkWritableNextCache();

const serverPath = path.join(__dirname, "server.js");
console.log("[karto] start.js cwd=", process.cwd());
console.log("[karto] PORT=", process.env.PORT || "3000");
console.log("[karto] HOSTNAME=", process.env.HOSTNAME);
console.log("[karto] NEXT_CACHE_DIR=", process.env.NEXT_CACHE_DIR);

if (!fs.existsSync(serverPath)) {
  console.error("[karto] server.js missing at", serverPath);
  process.exit(1);
}

require(serverPath);

/** Резервный cron: если instrumentation не стартовал, HTTP-тик всё равно обработает inbox. */
(function startCronSelfPing() {
  const secret = process.env.CRON_SECRET && String(process.env.CRON_SECRET).trim();
  if (!secret) return;
  const port = process.env.PORT || "3000";
  const url = "http://127.0.0.1:" + port + "/api/cron/auto-reply-inbox-sync";
  const headers = { Authorization: "Bearer " + secret };
  const ping = () => {
    fetch(url, { headers }).catch((e) => {
      console.warn("[karto] cron self-ping failed:", e && e.message ? e.message : e);
    });
  };
  setTimeout(ping, 20000);
  setInterval(ping, 2 * 60 * 1000);
  console.info("[karto] cron self-ping enabled (every 2 min)");
})();
`;

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    if (fs.statSync(s).isDirectory()) {
      copyRecursive(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

console.log("copy-standalone: app dir", appDir);
console.log("copy-standalone: server.js", serverPath);

fs.writeFileSync(destStart, startJs, "utf8");
console.log("copy-standalone: start.js ->", destStart);

if (fs.existsSync(publicDir)) {
  copyRecursive(publicDir, destPublic);
  console.log("copy-standalone: public ->", destPublic);
}
if (fs.existsSync(staticDir)) {
  copyRecursive(staticDir, destStatic);
  console.log("copy-standalone: .next/static ->", destStatic);
}
