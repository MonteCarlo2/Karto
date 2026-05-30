/**
 * Копирует public и .next/static в каталог standalone-приложения (рядом с server.js).
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

if (fs.existsSync(publicDir)) {
  copyRecursive(publicDir, destPublic);
  console.log("copy-standalone: public ->", destPublic);
}
if (fs.existsSync(staticDir)) {
  copyRecursive(staticDir, destStatic);
  console.log("copy-standalone: .next/static ->", destStatic);
}
