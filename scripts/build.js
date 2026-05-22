// scripts/build.js — produces dist/firefox/ and dist/chrome/ from source
// Usage: node scripts/build.js           (builds both)
//        node scripts/build.js firefox   (Firefox only)
//        node scripts/build.js chrome    (Chrome only)

const fs   = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const POLY = path.join(ROOT, "node_modules", "webextension-polyfill", "dist", "browser-polyfill.js");

const COPY_ENTRIES = [
  "background.js",
  "content.js",
  "content.css",
  "lib",
  "popup",
  "options",
  "icons",
];

// ── helpers ────────────────────────────────────────────────────────────────────

function clean(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
  fs.mkdirSync(dir, { recursive: true });
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

// ── build ──────────────────────────────────────────────────────────────────────

function buildTarget(name, manifestOverrides = {}, manifestRemovals = []) {
  const dir = path.join(DIST, name);
  clean(dir);

  for (const entry of COPY_ENTRIES) {
    copyRecursive(path.join(ROOT, entry), path.join(dir, entry));
  }

  if (!fs.existsSync(POLY)) {
    console.error("browser-polyfill.js not found — run: npm install");
    process.exit(1);
  }
  fs.copyFileSync(POLY, path.join(dir, "browser-polyfill.js"));

  const base     = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
  const manifest = { ...base, ...manifestOverrides };
  for (const key of manifestRemovals) delete manifest[key];
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));

  console.log(`  built  dist/${name}/`);
}

// ── targets ────────────────────────────────────────────────────────────────────

const ALL_TARGETS = {
  firefox: () => {
    buildTarget("firefox", {
      browser_specific_settings: {
        gecko: {
          id: "blurtoclear@bheck890",
          data_collection_permissions: { required: ["none"], optional: [] }
        }
      },
      // Firefox MV3 uses "scripts" array instead of "service_worker"
      background: {
        scripts: ["browser-polyfill.js", "lib/prompts.js", "lib/api.js", "background.js"]
      }
    });
    // Remove importScripts() — not available outside a service worker context
    const bgPath = path.join(DIST, "firefox", "background.js");
    const bg = fs.readFileSync(bgPath, "utf8")
      .replace(/^importScripts\([^)]*\);\n?/m, "");
    fs.writeFileSync(bgPath, bg);
  },
  chrome: () => buildTarget("chrome", {}, ["browser_specific_settings"]),
};

const requested = process.argv[2];
const targets   = requested ? [requested] : Object.keys(ALL_TARGETS);

for (const t of targets) {
  if (!ALL_TARGETS[t]) {
    console.error(`Unknown target "${t}". Choose: ${Object.keys(ALL_TARGETS).join(", ")}`);
    process.exit(1);
  }
  ALL_TARGETS[t]();
}

console.log("done.");
