const { verifyWithGumroad, checkLicensePeriodically, isProUnlocked } = require("../lib/license");

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

// ── helpers ────────────────────────────────────────────────────────────────────

function makePurchase(email, overrides = {}) {
  return { email, refunded: false, chargebacked: false, ...overrides };
}

// Mock fetch for two-call flow (check then activate).
function mockFetchTwice(checkData, activateData) {
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ json: async () => checkData })
    .mockResolvedValueOnce({ json: async () => activateData });
}

// Mock fetch for one-call flow (fails early — no activation call needed).
function mockFetchOnce(data) {
  global.fetch = jest.fn().mockResolvedValue({ json: async () => data });
}

// ── verifyWithGumroad ──────────────────────────────────────────────────────────

describe("verifyWithGumroad", () => {
  afterEach(() => {
    global.fetch = undefined;
  });

  // ── Success — new device activation ─────────────────────────────────────────

  test("activates a new device: two fetch calls, returns valid:true", async () => {
    const purchase = makePurchase("User@Example.com");
    mockFetchTwice(
      { success: true, uses: 0, purchase },
      { success: true, uses: 1, purchase }
    );
    const result = await verifyWithGumroad("user@example.com", "ABC-123");
    expect(result).toEqual({ valid: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test("email comparison is case-insensitive", async () => {
    const purchase = makePurchase("USER@EXAMPLE.COM");
    mockFetchTwice(
      { success: true, uses: 0, purchase },
      { success: true, uses: 1, purchase }
    );
    const result = await verifyWithGumroad("user@example.com", "ABC-123");
    expect(result).toEqual({ valid: true });
  });

  test("allows activation when uses is just below the limit (4 of 5)", async () => {
    const purchase = makePurchase("user@example.com");
    mockFetchTwice(
      { success: true, uses: 4, purchase },
      { success: true, uses: 5, purchase }
    );
    const result = await verifyWithGumroad("user@example.com", "ABC-123");
    expect(result).toEqual({ valid: true });
  });

  // ── Already activated on this device ────────────────────────────────────────

  test("skips activation call when device already activated with same key", async () => {
    const appGet = jest.fn().mockResolvedValue({ deviceActivated: "ABC-123" });
    const appSet = jest.fn();
    mockFetchOnce({ success: true, uses: 2, purchase: makePurchase("user@example.com") });
    const result = await verifyWithGumroad("user@example.com", "ABC-123", { appGet, appSet });
    expect(result).toEqual({ valid: true });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(appSet).not.toHaveBeenCalled();
  });

  // ── Device limit ─────────────────────────────────────────────────────────────

  test("rejects when device limit of 5 is reached", async () => {
    mockFetchOnce({ success: true, uses: 5, purchase: makePurchase("user@example.com") });
    const result = await verifyWithGumroad("user@example.com", "ABC-123");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Maximum devices reached/);
    expect(result.error).toMatch(/northportlabs@gmail\.com/);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("rejects when uses exceeds 5", async () => {
    mockFetchOnce({ success: true, uses: 9, purchase: makePurchase("user@example.com") });
    const result = await verifyWithGumroad("user@example.com", "ABC-123");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Maximum devices reached/);
  });

  // ── Refund / chargeback ──────────────────────────────────────────────────────

  test("rejects refunded license", async () => {
    mockFetchOnce({ success: true, uses: 1, purchase: makePurchase("user@example.com", { refunded: true }) });
    const result = await verifyWithGumroad("user@example.com", "ABC-123");
    expect(result).toEqual({ valid: false, error: "This license has been refunded and is no longer valid." });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("rejects chargebacked license", async () => {
    mockFetchOnce({ success: true, uses: 1, purchase: makePurchase("user@example.com", { chargebacked: true }) });
    const result = await verifyWithGumroad("user@example.com", "ABC-123");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/chargeback/);
    expect(result.error).toMatch(/northportlabs@gmail\.com/);
  });

  // ── Standard failures ────────────────────────────────────────────────────────

  test("returns valid:false with wrong-email error when email mismatches", async () => {
    mockFetchOnce({ success: true, uses: 0, purchase: makePurchase("other@example.com") });
    const result = await verifyWithGumroad("user@example.com", "ABC-123");
    expect(result).toEqual({ valid: false, error: "Wrong email for this license key" });
  });

  test("returns valid:false with invalid-key error when success=false", async () => {
    mockFetchOnce({ success: false });
    const result = await verifyWithGumroad("user@example.com", "BAD-KEY");
    expect(result).toEqual({ valid: false, error: "Invalid license key" });
  });

  test("returns valid:false with network error when fetch throws", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("Network failure"));
    const result = await verifyWithGumroad("user@example.com", "ABC-123");
    expect(result).toEqual({ valid: false, error: "Could not reach Gumroad. Check your connection." });
  });

  test("second activation call failing returns a retry error", async () => {
    const purchase = makePurchase("user@example.com");
    mockFetchTwice(
      { success: true, uses: 0, purchase },
      { success: false }
    );
    const result = await verifyWithGumroad("user@example.com", "ABC-123");
    expect(result).toEqual({ valid: false, error: "Could not activate this device. Please try again." });
  });

  test("stamps deviceActivated and timestamps on successful new-device activation", async () => {
    const appSet = jest.fn().mockResolvedValue();
    const appGet = jest.fn().mockResolvedValue({ deviceActivated: null });
    const purchase = makePurchase("user@example.com");
    mockFetchTwice(
      { success: true, uses: 0, purchase },
      { success: true, uses: 1, purchase }
    );
    await verifyWithGumroad("user@example.com", "ABC-123", { appGet, appSet });
    expect(appSet).toHaveBeenCalledWith(expect.objectContaining({ deviceActivated: "ABC-123" }));
  });
});

// ── checkLicensePeriodically ───────────────────────────────────────────────────

describe("checkLicensePeriodically", () => {
  const DAY_MS  = 24 * 60 * 60 * 1000;
  const HOUR_MS =      60 * 60 * 1000;

  function makeStorage(lastCheck = 0, lastAttempt = 0) {
    const appGet = jest.fn().mockResolvedValue({ lastLicenseCheck: lastCheck, lastLicenseAttempt: lastAttempt });
    const appSet = jest.fn().mockResolvedValue();
    return { appGet, appSet };
  }

  afterEach(() => {
    global.fetch = undefined;
  });

  test("skips check when last confirmed check was within 24 hours", async () => {
    const storage = makeStorage(Date.now() - HOUR_MS); // checked 1 hour ago
    const result = await checkLicensePeriodically("a@b.com", "KEY", storage);
    expect(result).toBeNull();
    expect(global.fetch).toBeUndefined();
  });

  test("skips check when last attempt was a network failure within 1 hour", async () => {
    // lastCheck is old (>24h), but lastAttempt was recent (<1h)
    const storage = makeStorage(0, Date.now() - 30 * 60 * 1000); // attempted 30 min ago
    const result = await checkLicensePeriodically("a@b.com", "KEY", storage);
    expect(result).toBeNull();
    expect(global.fetch).toBeUndefined();
  });

  test("returns null when neither appGet nor appSet is available", async () => {
    const result = await checkLicensePeriodically("a@b.com", "KEY");
    expect(result).toBeNull();
  });

  test("runs check and returns valid:true when license is still valid", async () => {
    const storage = makeStorage(Date.now() - DAY_MS - 1000); // last check was >24h ago
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ success: true, purchase: { refunded: false, chargebacked: false } })
    });
    const result = await checkLicensePeriodically("a@b.com", "KEY", storage);
    expect(result).toEqual({ valid: true });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(storage.appSet).toHaveBeenCalled();
  });

  test("returns revoked:true when license is refunded", async () => {
    const storage = makeStorage(Date.now() - DAY_MS - 1000);
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ success: true, purchase: { refunded: true, chargebacked: false } })
    });
    const result = await checkLicensePeriodically("a@b.com", "KEY", storage);
    expect(result).toEqual({ revoked: true });
  });

  test("returns revoked:true when Gumroad says success:false", async () => {
    const storage = makeStorage(Date.now() - DAY_MS - 1000);
    global.fetch = jest.fn().mockResolvedValue({ json: async () => ({ success: false }) });
    const result = await checkLicensePeriodically("a@b.com", "KEY", storage);
    expect(result).toEqual({ revoked: true });
  });

  test("returns null on network error (benefit of the doubt)", async () => {
    const storage = makeStorage(Date.now() - DAY_MS - 1000);
    global.fetch = jest.fn().mockRejectedValue(new Error("offline"));
    const result = await checkLicensePeriodically("a@b.com", "KEY", storage);
    expect(result).toBeNull();
  });

  test("retries after 1 hour following a network failure", async () => {
    // lastCheck old, lastAttempt was >1h ago (so retry is due)
    const storage = makeStorage(0, Date.now() - HOUR_MS - 1000);
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ success: true, purchase: { refunded: false, chargebacked: false } })
    });
    const result = await checkLicensePeriodically("a@b.com", "KEY", storage);
    expect(result).toEqual({ valid: true });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("returns revoked:true when license is chargebacked", async () => {
    const storage = makeStorage(Date.now() - DAY_MS - 1000);
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ success: true, purchase: { refunded: false, chargebacked: true } })
    });
    const result = await checkLicensePeriodically("a@b.com", "KEY", storage);
    expect(result).toEqual({ revoked: true });
  });

  test("stamps lastLicenseAttempt before fetch (crash safety)", async () => {
    const storage = makeStorage(Date.now() - DAY_MS - 1000);
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ success: true, purchase: { refunded: false, chargebacked: false } })
    });
    await checkLicensePeriodically("a@b.com", "KEY", storage);
    // appSet should have been called at least twice: once before fetch, once after
    expect(storage.appSet).toHaveBeenCalledTimes(2);
    expect(storage.appSet).toHaveBeenNthCalledWith(1, expect.objectContaining({ lastLicenseAttempt: expect.any(Number) }));
  });
});
