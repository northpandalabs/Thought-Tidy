const { verifyWithGumroad, isProUnlocked } = require("../lib/license");

// ── isProUnlocked ──────────────────────────────────────────────────────────────

describe("isProUnlocked", () => {
  test("returns true when both licenseEmail and licenseKey are set", () => {
    expect(isProUnlocked({ licenseEmail: "user@example.com", licenseKey: "ABC-123" })).toBe(true);
  });

  test("returns false when licenseEmail is missing", () => {
    expect(isProUnlocked({ licenseKey: "ABC-123" })).toBe(false);
  });

  test("returns false when licenseKey is missing", () => {
    expect(isProUnlocked({ licenseEmail: "user@example.com" })).toBe(false);
  });

  test("returns false when both are empty strings", () => {
    expect(isProUnlocked({ licenseEmail: "", licenseKey: "" })).toBe(false);
  });

  test("returns false for empty settings object", () => {
    expect(isProUnlocked({})).toBe(false);
  });
});

// ── verifyWithGumroad ──────────────────────────────────────────────────────────

describe("verifyWithGumroad", () => {
  afterEach(() => {
    global.fetch = undefined;
  });

  test("returns valid:true when success=true and email matches", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ success: true, purchase: { email: "User@Example.com" } }),
    });
    const result = await verifyWithGumroad("user@example.com", "ABC-123");
    expect(result).toEqual({ valid: true });
  });

  test("returns valid:false with wrong-email error when email mismatches", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ success: true, purchase: { email: "other@example.com" } }),
    });
    const result = await verifyWithGumroad("user@example.com", "ABC-123");
    expect(result).toEqual({ valid: false, error: "Wrong email for this license key" });
  });

  test("returns valid:false with invalid-key error when success=false", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ success: false }),
    });
    const result = await verifyWithGumroad("user@example.com", "BAD-KEY");
    expect(result).toEqual({ valid: false, error: "Invalid license key" });
  });

  test("returns valid:false with network error when fetch throws", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("Network failure"));
    const result = await verifyWithGumroad("user@example.com", "ABC-123");
    expect(result).toEqual({ valid: false, error: "Could not reach Gumroad — check your connection" });
  });

  test("email comparison is case-insensitive", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ success: true, purchase: { email: "USER@EXAMPLE.COM" } }),
    });
    const result = await verifyWithGumroad("user@example.com", "ABC-123");
    expect(result).toEqual({ valid: true });
  });
});
