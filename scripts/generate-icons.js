// scripts/generate-icons.js — resize icons/icon.png to required extension sizes
// Run once whenever the source icon changes: node scripts/generate-icons.js

const path = require("path");
const { Jimp } = require("jimp");

const ROOT   = path.resolve(__dirname, "..");
const SRC    = path.join(ROOT, "icons", "icon.png");
const SIZES  = [16, 32, 48, 128];

async function main() {
  const img = await Jimp.read(SRC);
  for (const size of SIZES) {
    const dest = path.join(ROOT, "icons", `icon-${size}.png`);
    await img.clone().resize({ w: size, h: size }).write(dest);
    console.log(`  wrote icons/icon-${size}.png`);
  }
  console.log("done.");
}

main().catch(err => { console.error(err); process.exit(1); });
