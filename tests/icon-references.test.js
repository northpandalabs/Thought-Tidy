// tests/icon-references.test.js
// Ensures no HTML file in the project references icon.svg.
// SVGs are excluded from the extension build and not supported in Electron
// icon img tags — a stale .svg reference produces a blank icon at runtime.

const fs   = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

// Directories that contain shipped HTML files (extension + desktop renderer).
const HTML_DIRS = [
  "popup",
  "options",
  "history",
  "desktop/renderer",
];

function collectHtmlFiles(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs)
    .filter(f => f.endsWith(".html"))
    .map(f => path.join(abs, f));
}

const htmlFiles = HTML_DIRS.flatMap(collectHtmlFiles);

describe("HTML icon references — no SVG allowed", () => {
  test("at least one HTML file is found to scan", () => {
    expect(htmlFiles.length).toBeGreaterThan(0);
  });

  test.each(htmlFiles)(
    "%s does not reference icon.svg",
    (filePath) => {
      const content = fs.readFileSync(filePath, "utf8");
      const matches = [...content.matchAll(/icon\.svg/g)];
      expect(matches).toHaveLength(0);
    }
  );

  test.each(htmlFiles)(
    "%s icon img src resolves to an existing PNG file",
    (filePath) => {
      const content = fs.readFileSync(filePath, "utf8");
      const dir     = path.dirname(filePath);
      // Find all <img src="...icon..."> references
      const imgRe   = /<img[^>]+src="([^"]*icon[^"]*\.(png|svg|webp|jpg))"[^>]*>/gi;
      let match;
      while ((match = imgRe.exec(content)) !== null) {
        const src = match[1];
        expect(src).not.toMatch(/\.svg$/i);
        const abs = path.resolve(dir, src);
        expect(fs.existsSync(abs)).toBe(true);
      }
    }
  );
});
