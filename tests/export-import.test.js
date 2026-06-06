// Tests for lib/export-import.js
// Uses real Web Crypto API (available in Node 20 via globalThis.crypto)

const { buildExport, parseExport, decryptExport, encryptField, decryptField } = require("../lib/export-import");

const SAMPLE_SETTINGS = { openaiModel: "gpt-4o", theme: "dark" };
const SAMPLE_HISTORY  = [{ action: "fix-spelling", words: 42 }];
const SAMPLE_AUTH     = { licenseEmail: "user@example.com", licenseKey: "KEY-XXXX" };
const PIN             = "testpin123";

// ── buildExport ───────────────────────────────────────────────────────────────

describe("buildExport", () => {
  test("returns valid JSON string", async () => {
    const json = await buildExport({ ...SAMPLE_AUTH, settings: SAMPLE_SETTINGS, history: SAMPLE_HISTORY }, PIN);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  test("result has version, exported_at, auth, settings, history fields", async () => {
    const parsed = JSON.parse(
      await buildExport({ ...SAMPLE_AUTH, settings: SAMPLE_SETTINGS, history: SAMPLE_HISTORY }, PIN)
    );
    expect(parsed).toHaveProperty("version");
    expect(parsed).toHaveProperty("exported_at");
    expect(parsed).toHaveProperty("auth");
    expect(parsed).toHaveProperty("settings");
    expect(parsed).toHaveProperty("history");
  });

  test("auth is always a string (encrypted) regardless of protectAll", async () => {
    const p1 = JSON.parse(await buildExport({ ...SAMPLE_AUTH, settings: SAMPLE_SETTINGS }, PIN, true));
    const p2 = JSON.parse(await buildExport({ ...SAMPLE_AUTH, settings: SAMPLE_SETTINGS }, PIN, false));
    expect(typeof p1.auth).toBe("string");
    expect(typeof p2.auth).toBe("string");
  });

  test("protectAll=true: settings and history are strings (encrypted)", async () => {
    const parsed = JSON.parse(
      await buildExport({ ...SAMPLE_AUTH, settings: SAMPLE_SETTINGS, history: SAMPLE_HISTORY }, PIN, true)
    );
    expect(typeof parsed.settings).toBe("string");
    expect(typeof parsed.history).toBe("string");
  });

  test("protectAll=false: settings and history are objects (plain)", async () => {
    const parsed = JSON.parse(
      await buildExport({ ...SAMPLE_AUTH, settings: SAMPLE_SETTINGS, history: SAMPLE_HISTORY }, PIN, false)
    );
    expect(typeof parsed.settings).toBe("object");
    expect(typeof parsed.history).toBe("object");
  });

  test("only settings checked (no history): history field absent", async () => {
    const parsed = JSON.parse(
      await buildExport({ ...SAMPLE_AUTH, settings: SAMPLE_SETTINGS }, PIN)
    );
    expect(parsed.settings).toBeDefined();
    expect(parsed.history == null || parsed.history === undefined).toBe(true);
  });

  test("only history checked (no settings): settings field absent", async () => {
    const parsed = JSON.parse(
      await buildExport({ ...SAMPLE_AUTH, history: SAMPLE_HISTORY }, PIN)
    );
    expect(parsed.history).toBeDefined();
    expect(parsed.settings == null || parsed.settings === undefined).toBe(true);
  });
});

// ── parseExport ───────────────────────────────────────────────────────────────

describe("parseExport", () => {
  test("accepts valid structure and returns parsed object", async () => {
    const json   = await buildExport({ ...SAMPLE_AUTH, settings: SAMPLE_SETTINGS }, PIN);
    const parsed = parseExport(json);
    expect(parsed).toHaveProperty("version");
    expect(parsed).toHaveProperty("auth");
  });

  test("throws on missing auth field", () => {
    const bad = JSON.stringify({ version: 1, exported_at: new Date().toISOString() });
    expect(() => parseExport(bad)).toThrow(/missing auth/i);
  });

  test("throws on missing version field", () => {
    const bad = JSON.stringify({ auth: "somestring", exported_at: new Date().toISOString() });
    expect(() => parseExport(bad)).toThrow(/missing version/i);
  });

  test("throws on non-JSON input", () => {
    expect(() => parseExport("not-json-at-all")).toThrow();
  });

  test("throws on empty string", () => {
    expect(() => parseExport("")).toThrow();
  });
});

// ── decryptExport ─────────────────────────────────────────────────────────────

describe("decryptExport", () => {
  let built, parsed;

  beforeEach(async () => {
    built  = await buildExport({ ...SAMPLE_AUTH, settings: SAMPLE_SETTINGS, history: SAMPLE_HISTORY }, PIN, true);
    parsed = parseExport(built);
  });

  test("correct pin returns { settings, history, licenseEmail, licenseKey }", async () => {
    const result = await decryptExport(parsed, PIN);
    expect(result.licenseEmail).toBe(SAMPLE_AUTH.licenseEmail);
    expect(result.licenseKey).toBe(SAMPLE_AUTH.licenseKey);
    expect(result.settings).toEqual(SAMPLE_SETTINGS);
    expect(result.history).toEqual(SAMPLE_HISTORY);
  });

  test("wrong pin throws error", async () => {
    await expect(decryptExport(parsed, "wrongpin")).rejects.toThrow(/incorrect pin/i);
  });

  test("tampered auth (corrupt base64) throws error", async () => {
    const tampered = { ...parsed, auth: "notvalidbase64!!!" };
    await expect(decryptExport(tampered, PIN)).rejects.toThrow();
  });
});

// ── round-trip tests ──────────────────────────────────────────────────────────

describe("round-trip", () => {
  test("buildExport → parseExport → decryptExport returns original data (protectAll=true)", async () => {
    const json   = await buildExport({ ...SAMPLE_AUTH, settings: SAMPLE_SETTINGS, history: SAMPLE_HISTORY }, PIN, true);
    const parsed = parseExport(json);
    const result = await decryptExport(parsed, PIN);
    expect(result.licenseEmail).toBe(SAMPLE_AUTH.licenseEmail);
    expect(result.licenseKey).toBe(SAMPLE_AUTH.licenseKey);
    expect(result.settings).toEqual(SAMPLE_SETTINGS);
    expect(result.history).toEqual(SAMPLE_HISTORY);
  });

  test("buildExport → parseExport → decryptExport returns original data (protectAll=false)", async () => {
    const json   = await buildExport({ ...SAMPLE_AUTH, settings: SAMPLE_SETTINGS, history: SAMPLE_HISTORY }, PIN, false);
    const parsed = parseExport(json);
    const result = await decryptExport(parsed, PIN);
    expect(result.licenseEmail).toBe(SAMPLE_AUTH.licenseEmail);
    expect(result.licenseKey).toBe(SAMPLE_AUTH.licenseKey);
    expect(result.settings).toEqual(SAMPLE_SETTINGS);
    expect(result.history).toEqual(SAMPLE_HISTORY);
  });
});

// ── encryptField / decryptField ───────────────────────────────────────────────

describe("encryptField / decryptField", () => {
  test("round-trip returns original plaintext", async () => {
    const enc = await encryptField("hello world", PIN);
    const dec = await decryptField(enc, PIN);
    expect(dec).toBe("hello world");
  });

  test("wrong pin on decryptField throws", async () => {
    const enc = await encryptField("secret", PIN);
    await expect(decryptField(enc, "badpin")).rejects.toThrow();
  });
});
