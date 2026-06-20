// desktop/tests/ipc-security.test.js
// Runtime tests for security hardening applied to the desktop IPC layer.
// Covers M11 (store-set key blocklist) and M12 (zoom factor clamping).

const fs   = require("fs");
const path = require("path");

const { makeStoreSetHandler } = require("../ipc-handlers");

// ── Mock helpers ───────────────────────────────────────────────────────────────

function makeStore(initial = {}) {
  const data = { ...initial };
  return {
    get: (key)      => data[key],
    set: (key, val) => { data[key] = val; },
    store: data
  };
}

const EVENT = null; // ipcMain event — unused by these handlers

// ── M11: store-set blocked key list ──────────────────────────────────────────

describe("M11 — store-set blocked keys (FIXED)", () => {
  test("autoUpdaterEnabled cannot be written via store-set", () => {
    const store   = makeStore({ autoUpdaterEnabled: true });
    const handler = makeStoreSetHandler(store);
    handler(EVENT, { autoUpdaterEnabled: false });
    // Value must remain unchanged — the handler silently drops blocked keys
    expect(store.get("autoUpdaterEnabled")).toBe(true);
  });

  test("updateAvailable cannot be written via store-set", () => {
    const store   = makeStore({ updateAvailable: false });
    const handler = makeStoreSetHandler(store);
    handler(EVENT, { updateAvailable: true });
    expect(store.get("updateAvailable")).toBe(false);
  });

  test("blocked keys are silently dropped even when mixed with allowed keys", () => {
    const store   = makeStore({ autoUpdaterEnabled: true, provider: "openai" });
    const handler = makeStoreSetHandler(store);
    handler(EVENT, { autoUpdaterEnabled: false, provider: "gemini" });
    expect(store.get("autoUpdaterEnabled")).toBe(true);   // blocked — unchanged
    expect(store.get("provider")).toBe("gemini");          // allowed — updated
  });

  test("normal keys (provider, openaiModel, variants) pass through unaffected", () => {
    const store   = makeStore();
    const handler = makeStoreSetHandler(store);
    handler(EVENT, { provider: "claude", openaiModel: "gpt-4o", variants: 3 });
    expect(store.get("provider")).toBe("claude");
    expect(store.get("openaiModel")).toBe("gpt-4o");
    expect(store.get("variants")).toBe(3);
  });

  test("handler does not throw when only blocked keys are passed", () => {
    const store   = makeStore();
    const handler = makeStoreSetHandler(store);
    expect(() => handler(EVENT, { autoUpdaterEnabled: true, updateAvailable: true })).not.toThrow();
  });
});

// ── M12: zoom factor clamping ─────────────────────────────────────────────────
// The clamping logic lives inside main.js's set-zoom IPC handler. Since main.js
// depends on Electron APIs we cannot require it in Jest. We verify the pure
// arithmetic by extracting the same formula and also confirm its presence in
// the source file.

function clampZoom(zoom) {
  const raw    = (!zoom || zoom === "auto") ? 1.0 : parseFloat(zoom);
  const factor = isNaN(raw) ? 1.0 : Math.min(2.0, Math.max(0.5, raw));
  return factor;
}

describe("M12 — zoom factor clamping (FIXED)", () => {
  // ── arithmetic coverage ────────────────────────────────────────────────────

  test("in-range zoom factor 1.5 passes through unchanged", () => {
    expect(clampZoom(1.5)).toBe(1.5);
  });

  test("in-range minimum 0.5 passes through unchanged", () => {
    expect(clampZoom(0.5)).toBe(0.5);
  });

  test("in-range maximum 2.0 passes through unchanged", () => {
    expect(clampZoom(2.0)).toBe(2.0);
  });

  test("below-minimum value 0.25 is clamped to 0.5", () => {
    expect(clampZoom(0.25)).toBe(0.5);
  });

  test("above-maximum value 3.0 is clamped to 2.0", () => {
    expect(clampZoom(3.0)).toBe(2.0);
  });

  test("null zoom defaults to 1.0", () => {
    expect(clampZoom(null)).toBe(1.0);
  });

  test('"auto" zoom defaults to 1.0', () => {
    expect(clampZoom("auto")).toBe(1.0);
  });

  test("empty-string zoom defaults to 1.0", () => {
    expect(clampZoom("")).toBe(1.0);
  });

  test("non-numeric string (NaN) defaults to 1.0", () => {
    expect(clampZoom("abc")).toBe(1.0);
  });

  test("undefined zoom defaults to 1.0", () => {
    expect(clampZoom(undefined)).toBe(1.0);
  });

  // ── source presence ────────────────────────────────────────────────────────

  test("desktop/main.js set-zoom handler contains clamping with Math.min/Math.max", () => {
    const src = fs.readFileSync(path.join(__dirname, "../main.js"), "utf8");
    expect(src).toContain("Math.min(2.0, Math.max(0.5, raw))");
  });

  test("desktop/main.js set-zoom handler handles NaN by falling back to 1.0", () => {
    const src = fs.readFileSync(path.join(__dirname, "../main.js"), "utf8");
    expect(src).toContain("isNaN(raw) ? 1.0");
  });
});
