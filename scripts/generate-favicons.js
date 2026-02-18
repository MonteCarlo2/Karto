const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const publicDir = path.join(__dirname, "..", "public");
const src = path.join(publicDir, "logo-flow.png");
const favicon32 = path.join(publicDir, "favicon-32x32.png");
const appleTouch = path.join(publicDir, "apple-touch-icon.png");

if (!fs.existsSync(src)) {
  console.error("public/logo-flow.png not found");
  process.exit(1);
}

async function run() {
  await sharp(src)
    .resize(32, 32)
    .png()
    .toFile(favicon32);
  console.log("Created favicon-32x32.png (32x32)");

  await sharp(src)
    .resize(180, 180)
    .png()
    .toFile(appleTouch);
  console.log("Created apple-touch-icon.png (180x180)");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
