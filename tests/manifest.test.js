// tests/manifest.test.js
// Validates manifest.json against Chrome Web Store and Firefox AMO upload requirements.

const fs   = require("fs");
const path = require("path");

const manifest = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../manifest.json"), "utf8")
);

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
