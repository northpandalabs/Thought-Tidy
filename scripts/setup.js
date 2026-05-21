// scripts/setup.js — copies browser-polyfill.js to the project root so
// you can load the extension directly in Firefox/Chrome during development
// without running a full build first.  Run once after: npm install

const fs   = require("fs");
const path = require("path");

const src  = path.join(__dirname, "..", "node_modules", "webextension-polyfill", "dist", "browser-polyfill.js");
const dest = path.join(__dirname, "..", "browser-polyfill.js");

if (!fs.existsSync(src)) {
  console.error("webextension-polyfill not found — run: npm install");
  process.exit(1);
}

fs.copyFileSync(src, dest);
console.log("browser-polyfill.js copied to project root (for local dev).");
