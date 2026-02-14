/**
 * Копирует public и .next/static в .next/standalone для корректной отдачи статики
 * при деплое (Next.js standalone не всегда копирует это автоматически).
 * Запускается после next build на хостинге (Timeweb и т.д.).
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const standalone = path.join(root, ".next", "standalone");

if (!fs.existsSync(standalone)) {
  console.warn("copy-standalone: .next/standalone не найден, пропуск.");
  process.exit(0);
}

const publicDir = path.join(root, "public");
const staticDir = path.join(root, ".next", "static");
const destPublic = path.join(standalone, "public");
const destStatic = path.join(standalone, ".next", "static");

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

if (fs.existsSync(publicDir)) {
  copyRecursive(publicDir, destPublic);
  console.log("copy-standalone: public скопирован в .next/standalone/public");
}
if (fs.existsSync(staticDir)) {
  copyRecursive(staticDir, destStatic);
  console.log("copy-standalone: .next/static скопирован в .next/standalone/.next/static");
}
