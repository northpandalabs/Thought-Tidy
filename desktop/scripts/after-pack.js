// Injects LICENSE_CIPHER_KEY into lib/license.js after electron-builder copies extraResources.
// The source lib/license.js has placeholder "%%LICENSE_CIPHER_KEY%%" — never the real value.
const fs   = require("fs");
const path = require("path");

module.exports = async function afterPack({ appOutDir }) {
  const licPath = path.join(appOutDir, "resources", "lib", "license.js");
  if (!fs.existsSync(licPath)) {
    console.warn("[after-pack] lib/license.js not found at:", licPath);
    return;
  }

  let key = process.env.LICENSE_CIPHER_KEY;
  if (!key) {
    const etcFile = path.join(__dirname, "..", "..", "ETC", "brainfix-ai.env");
    if (fs.existsSync(etcFile)) {
      for (const line of fs.readFileSync(etcFile, "utf8").split("\n")) {
        const eq = line.indexOf("=");
        if (eq > 0 && line.slice(0, eq).trim() === "LICENSE_CIPHER_KEY") {
          key = line.slice(eq + 1).trim();
          break;
        }
      }
    }
  }

  if (!key) {
    console.error("[after-pack] ERROR: LICENSE_CIPHER_KEY env var not set.");
    console.error("             Corp/demo license activation will fail in the built app.");
    return;
  }

  const src = fs.readFileSync(licPath, "utf8");
  if (!src.includes('"%%LICENSE_CIPHER_KEY%%"')) {
    console.log("[after-pack] lib/license.js: placeholder already replaced, skipping.");
    return;
  }
  fs.writeFileSync(licPath, src.replace('"%%LICENSE_CIPHER_KEY%%"', JSON.stringify(key)));
  console.log("[after-pack] LICENSE_CIPHER_KEY injected into lib/license.js");
};
