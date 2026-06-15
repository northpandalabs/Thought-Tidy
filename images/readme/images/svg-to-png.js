// svg-to-png.js — converts all SVGs in this directory to PNG in ./png/
// Run: node svg-to-png.js
// Requires sharp (uses global install if not local)

const fs   = require("fs");
const path = require("path");

let sharp;
try {
  sharp = require("sharp");
} catch {
  const globalPath = require("child_process")
    .execSync("npm root -g").toString().trim();
  sharp = require(path.join(globalPath, "@gitlawb/openclaude/node_modules/sharp"));
}

const DIR = __dirname;
const OUT = path.join(DIR, "png");

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

const svgs = fs.readdirSync(DIR).filter(f => f.endsWith(".svg"));

(async () => {
  for (const file of svgs) {
    const src  = path.join(DIR, file);
    const dest = path.join(OUT, file.replace(".svg", ".png"));
    const svg  = fs.readFileSync(src);
    await sharp(svg, { density: 144 }).png().toFile(dest);
    console.log(`  ${file} → png/${path.basename(dest)}`);
  }
  console.log(`\nDone — ${svgs.length} file(s) written to ${OUT}`);
})();
