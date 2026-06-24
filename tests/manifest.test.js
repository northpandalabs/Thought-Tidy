// tests/manifest.test.js
// Validates manifest.json against Chrome Web Store and Firefox AMO upload requirements.

const fs   = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8")
);

// Collect every unique icon path declared in the manifest.
function collectIconPaths(m) {
  const paths = [];
  if (m.icons) paths.push(...Object.values(m.icons));
  if (m.action?.default_icon) {
    const icon = m.action.default_icon;
    if (typeof icon === "string") paths.push(icon);
    else                          paths.push(...Object.values(icon));
  }
  return [...new Set(paths)];
}

function pngDimensions(filePath) {
  const buf = fs.readFileSync(filePath);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// All declared size→path pairs across icons and action.default_icon.
function collectSizePairs(m) {
  const pairs = [];
  if (m.icons) {
    for (const [size, p] of Object.entries(m.icons)) pairs.push({ size: Number(size), p, src: "icons" });
  }
  if (m.action?.default_icon && typeof m.action.default_icon === "object") {
    for (const [size, p] of Object.entries(m.action.default_icon)) pairs.push({ size: Number(size), p, src: "action.default_icon" });
  }
  return pairs;
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// ── File validity ─────────────────────────────────────────────────────────────

describe("manifest.json — icon file validity (Chrome & Firefox)", () => {
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

// ── Exact size match ──────────────────────────────────────────────────────────
// Each declared size key must point to a file whose actual pixel dimensions
// match the key exactly. Use scripts/generate-icons.js to regenerate if the
// source icon changes.

describe("manifest.json — declared icon size matches actual file dimensions", () => {
  const pairs = collectSizePairs(manifest);

  test.each(pairs)(
    '$src["$size"] file is exactly $size×$size pixels',
    ({ size, p }) => {
      const abs = path.join(ROOT, p);
      const { width, height } = pngDimensions(abs);
      expect(width).toBe(size);
      expect(height).toBe(size);
    }
  );
});

// ── Chrome Web Store requirements ─────────────────────────────────────────────

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

  test("icons object includes a 128px entry (required by Chrome Web Store)", () => {
    expect(manifest.icons).toHaveProperty("128");
  });
});

// ── host_permissions — required for direct browser → API calls ────────────────

describe("manifest.json — host_permissions include all AI provider APIs", () => {
  const hosts = manifest.host_permissions || [];

  test("host_permissions is present and non-empty", () => {
    expect(hosts.length).toBeGreaterThan(0);
  });

  test("includes api.openai.com", () => {
    expect(hosts.some(h => h.includes("openai.com"))).toBe(true);
  });

  test("includes api.anthropic.com", () => {
    expect(hosts.some(h => h.includes("anthropic.com"))).toBe(true);
  });

  test("includes generativelanguage.googleapis.com (Gemini)", () => {
    expect(hosts.some(h => h.includes("googleapis.com"))).toBe(true);
  });

  test("includes api.githubcopilot.com (GitHub Copilot)", () => {
    expect(hosts.some(h => h.includes("githubcopilot.com"))).toBe(true);
  });
});

// ── Firefox AMO requirements ──────────────────────────────────────────────────

describe("manifest.json — Firefox AMO upload requirements", () => {
  test("icons object includes a 48px entry (used by Firefox toolbar and AMO)", () => {
    expect(manifest.icons).toHaveProperty("48");
  });

  test("icons object includes a 128px entry (used by Firefox AMO listing)", () => {
    expect(manifest.icons).toHaveProperty("128");
  });
});
