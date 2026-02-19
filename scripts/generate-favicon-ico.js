/**
 * Генерирует public/favicon.ico из public/favicon-32x32.png.
 * Поисковики (Google, Яндекс) часто запрашивают именно /favicon.ico — без этого файла может показываться логотип хостинга (например Vercel).
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const pngPath = path.join(root, "public", "favicon-32x32.png");
const icoPath = path.join(root, "public", "favicon.ico");

if (!fs.existsSync(pngPath)) {
  console.warn("generate-favicon-ico: public/favicon-32x32.png не найден, пропуск.");
  process.exit(0);
}

let pngToIco;
try {
  pngToIco = require("png-to-ico");
} catch (e) {
  console.warn("generate-favicon-ico: png-to-ico не установлен. Установите: npm i -D png-to-ico");
  process.exit(0);
}

(async () => {
  try {
    const ico = await pngToIco(pngPath);
    fs.writeFileSync(icoPath, ico);
    console.log("generate-favicon-ico: public/favicon.ico создан.");
  } catch (err) {
    console.error("generate-favicon-ico:", err);
    process.exit(1);
  }
})();
