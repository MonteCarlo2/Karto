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
