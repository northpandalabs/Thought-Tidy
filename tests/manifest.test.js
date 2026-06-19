// tests/manifest.test.js
// Validates manifest.json against Chrome Web Store and Firefox AMO upload requirements.

const fs   = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8")
);

// Collect every icon path declared in the manifest.
function collectIconPaths(m) {
  const paths = [];
  if (m.icons)               paths.push(...Object.values(m.icons));
  if (m.action?.default_icon) {
    const icon = m.action.default_icon;
    if (typeof icon === "string") paths.push(icon);
    else                          paths.push(...Object.values(icon));
  }
  return [...new Set(paths)];
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("manifest.json — Chrome extension icon validity", () => {
  const iconPaths = collectIconPaths(manifest);

  test("at least one icon is declared", () => {
    expect(iconPaths.length).toBeGreaterThan(0);
  });

  test.each(iconPaths)("%s is not an SVG", (iconPath) => {
    expect(iconPath).not.toMatch(/\.svg$/i);
  });

  test.each(iconPaths)("%s exists on disk", (iconPath) => {
    expect(fs.existsSync(path.join(ROOT, iconPath))).toBe(true);
  });

  test.each(iconPaths)("%s is a valid PNG file", (iconPath) => {
    const buf = fs.readFileSync(path.join(ROOT, iconPath));
    expect(buf.slice(0, 8)).toEqual(PNG_MAGIC);
  });
});

describe("manifest.json — Chrome Web Store upload requirements", () => {
  test("description is present", () => {
    expect(typeof manifest.description).toBe("string");
    expect(manifest.description.length).toBeGreaterThan(0);
  });

  test("description does not exceed 132 characters", () => {
    expect(manifest.description.length).toBeLessThanOrEqual(132);
  });

  test("name is present and ≤ 45 characters", () => {
    expect(typeof manifest.name).toBe("string");
    expect(manifest.name.length).toBeGreaterThan(0);
    expect(manifest.name.length).toBeLessThanOrEqual(45);
  });

  test("version is a valid semver string", () => {
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("manifest_version is 3", () => {
    expect(manifest.manifest_version).toBe(3);
  });
});
