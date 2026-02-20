/**
 * Генерирует из public/favicon-32x32.png:
 * - public/favicon.ico (для браузеров и роботов; без редиректа — иначе Яндекс ругается).
 * - public/favicon-120x120.png (Яндекс рекомендует 120×120 для чёткого отображения в выдаче).
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const pngPath = path.join(root, "public", "favicon-32x32.png");
const icoPath = path.join(root, "public", "favicon.ico");
const png120Path = path.join(root, "public", "favicon-120x120.png");

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

let sharp;
try {
  sharp = require("sharp");
} catch (e) {
  console.warn("generate-favicon-ico: sharp не установлен, favicon-120x120.png не создаётся.");
}

(async () => {
  try {
    const ico = await pngToIco(pngPath);
    fs.writeFileSync(icoPath, ico);
    console.log("generate-favicon-ico: public/favicon.ico создан.");

    if (sharp) {
      await sharp(pngPath).resize(120, 120).png().toFile(png120Path);
      console.log("generate-favicon-ico: public/favicon-120x120.png создан (120×120 для Яндекса).");
    }
  } catch (err) {
    console.error("generate-favicon-ico:", err);
    process.exit(1);
  }
})();
