// Tests for lib/history-pin.js
// Uses real Web Crypto API (available in Node 20 via globalThis.crypto)

const { hashPin, verifyPin } = require("../lib/history-pin");

describe("hashPin", () => {
  test("returns a 64-char hex string", async () => {
    const hash = await hashPin("mypin");
    expect(typeof hash).toBe("string");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("is deterministic — same pin produces same hash", async () => {
    const h1 = await hashPin("deterministic");
    const h2 = await hashPin("deterministic");
    expect(h1).toBe(h2);
  });

  test("different pins produce different hashes", async () => {
    const h1 = await hashPin("pin1");
    const h2 = await hashPin("pin2");
    expect(h1).not.toBe(h2);
  });

  test("handles unicode characters in pin", async () => {
    const hash = await hashPin("pässwörd🔒");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("handles very long pin (100+ chars)", async () => {
    const longPin = "a".repeat(150);
    const hash = await hashPin(longPin);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("verifyPin", () => {
  test("returns true for correct pin", async () => {
    const stored = await hashPin("correct");
    const result = await verifyPin("correct", stored);
    expect(result).toBe(true);
  });

  test("returns false for wrong pin", async () => {
    const stored = await hashPin("correct");
    const result = await verifyPin("wrong", stored);
    expect(result).toBe(false);
  });

  test("returns false for empty string against real hash", async () => {
    const stored = await hashPin("realpin");
    const result = await verifyPin("", stored);
    expect(result).toBe(false);
  });
});
