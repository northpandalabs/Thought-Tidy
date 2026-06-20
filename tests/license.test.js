const fs   = require("fs");
const path = require("path");
const { verifyWithGumroad, checkLicensePeriodically, isProUnlocked, isDemoMode,
        verifyDemoMode, verifyCorpMode, cacheLicenseData } = require("../lib/license");

const HAS_KEY      = !!process.env.LICENSE_CIPHER_KEY;
const realDownloads = JSON.parse(fs.readFileSync(path.join(__dirname, "../legal/downloads.json"), "utf8"));

// describeWithKey: runs only when LICENSE_CIPHER_KEY is available (ETC folder / CI secret)
const describeWithKey = HAS_KEY ? describe : describe.skip;

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

// ── isDemoMode ─────────────────────────────────────────────────────────────────

describe("isDemoMode", () => {
  test("returns true when demoMode is set and no other license", () => {
    expect(isDemoMode({ demoMode: true })).toBe(true);
  });
  test("returns false when corpMode is also set", () => {
    expect(isDemoMode({ demoMode: true, corpMode: true })).toBe(false);
  });
  test("returns false when Gumroad keys are present", () => {
    expect(isDemoMode({ demoMode: true, licenseEmail: "a@b.com", licenseKey: "KEY" })).toBe(false);
  });
  test("returns false when demoMode is false", () => {
    expect(isDemoMode({ demoMode: false })).toBe(false);
  });
  test("returns false for empty object", () => {
    expect(isDemoMode({})).toBe(false);
  });
});

// ── isProUnlocked — demo + corp extensions ────────────────────────────────────

describe("isProUnlocked — demo and corp modes", () => {
  test("returns true when demoMode is set", () => {
    expect(isProUnlocked({ demoMode: true })).toBe(true);
  });
  test("returns true when corpMode is set", () => {
    expect(isProUnlocked({ corpMode: true })).toBe(true);
  });
  test("returns false when demoMode and corpMode are both false", () => {
    expect(isProUnlocked({ demoMode: false, corpMode: false })).toBe(false);
  });
});

// ── verifyDemoMode — paths that never need the cipher key ─────────────────────

describe("verifyDemoMode — network failure paths", () => {
  beforeEach(() => cacheLicenseData(null));
  afterEach(() => { global.fetch = undefined; cacheLicenseData(null); });

  test("returns error when downloads fetch fails and no cache", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("offline"));
    const result = await verifyDemoMode("0000-0000-0000-1792");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Could not reach/);
  });
});

// ── verifyDemoMode — full flow (only runs when LICENSE_CIPHER_KEY is available) ─

function makeWindow(deviceId = "test-device-uuid") {
  return {
    appGet: jest.fn().mockResolvedValue({ _deviceId: deviceId }),
    appSet: jest.fn().mockResolvedValue(),
  };
}

function mockSbOk(payload) {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => payload });
}

function mockSbFail() {
  global.fetch = jest.fn().mockRejectedValue(new Error("offline"));
}

describeWithKey("verifyDemoMode — full flow (requires LICENSE_CIPHER_KEY)", () => {
  beforeEach(() => {
    cacheLicenseData(realDownloads);
    global.window = makeWindow();
  });
  afterEach(() => {
    global.fetch = undefined;
    global.window = undefined;
    cacheLicenseData(null);
  });

  test("rejects wrong demo code", async () => {
    const result = await verifyDemoMode("0000-0000-0000-9999");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Invalid/);
    expect(global.fetch).toBeUndefined(); // no network call for wrong code
  });

  test("accepts correct demo code — Supabase returns ok", async () => {
    mockSbOk({ status: "ok", id: "demo-uuid", company_name: "Demo", max_seats: 10 });
    const result = await verifyDemoMode("0000-0000-0000-1792");
    expect(result.valid).toBe(true);
    expect(result.mode).toBe("demo");
    expect(result.corpLicenseId).toBe("demo-uuid");
    expect(result.sbUrl).toBeTruthy();
    expect(result.sbKey).toBeTruthy();
  });

  test("returns revoked error when Supabase says revoked", async () => {
    mockSbOk({ status: "revoked" });
    const result = await verifyDemoMode("0000-0000-0000-1792");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Access has ended/);
  });

  test("returns full-slots error when Supabase says full or rate_limited", async () => {
    mockSbOk({ status: "full", company_name: "Demo" });
    const result = await verifyDemoMode("0000-0000-0000-1792");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/slots are full/);
  });

  test("returns offline:true on network error after code validated", async () => {
    mockSbFail();
    const result = await verifyDemoMode("0000-0000-0000-1792");
    expect(result.valid).toBe(true);
    expect(result.offline).toBe(true);
  });
});

// ── verifyCorpMode — full flow (only runs when LICENSE_CIPHER_KEY is available) ─

describeWithKey("verifyCorpMode — full flow (requires LICENSE_CIPHER_KEY)", () => {
  beforeEach(() => {
    cacheLicenseData(realDownloads);
    global.window = makeWindow();
  });
  afterEach(() => {
    global.fetch = undefined;
    global.window = undefined;
    cacheLicenseData(null);
  });

  test("returns corpNotFound when code does not match any corp slot", async () => {
    const result = await verifyCorpMode("user@company.com", "0000-0000-0000-9999");
    expect(result.valid).toBe(false);
    expect(result.corpNotFound).toBe(true);
  });

  test("returns error for missing email domain", async () => {
    const result = await verifyCorpMode("nodomain", "0000-0000-0000-6393");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/company email/);
  });

  test("accepts matching corp code — Supabase returns ok", async () => {
    mockSbOk({ status: "ok", id: "corp-uuid", company_name: "bheckService", max_seats: 5 });
    const result = await verifyCorpMode("bheckservice@gmail.com", "0000-0000-0000-6393");
    expect(result.valid).toBe(true);
    expect(result.mode).toBe("corp");
    expect(result.corpLicenseId).toBe("corp-uuid");
  });

  test("returns error (not corpNotFound) on network failure after code matched", async () => {
    mockSbFail();
    const result = await verifyCorpMode("bheckservice@gmail.com", "0000-0000-0000-6393");
    expect(result.valid).toBe(false);
    expect(result.corpNotFound).toBeUndefined();
    expect(result.error).toMatch(/Could not reach/);
  });

  test("returns seats-full error when Supabase says full", async () => {
    mockSbOk({ status: "full", company_name: "bheckService" });
    const result = await verifyCorpMode("bheckservice@gmail.com", "0000-0000-0000-6393");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/No seats available/);
    expect(result.error).toMatch(/bheckService/);
  });

  test("returns rate-limited error when Supabase says rate_limited", async () => {
    mockSbOk({ status: "rate_limited", company_name: "bheckService" });
    const result = await verifyCorpMode("bheckservice@gmail.com", "0000-0000-0000-6393");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Too many activation attempts/);
  });

  test("returns revoked error when Supabase says revoked", async () => {
    mockSbOk({ status: "revoked" });
    const result = await verifyCorpMode("bheckservice@gmail.com", "0000-0000-0000-6393");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/revoked/);
  });

  test("returns not-found error when Supabase says not_found (domain mismatch)", async () => {
    mockSbOk({ status: "not_found" });
    const result = await verifyCorpMode("wrong@otherdomain.com", "0000-0000-0000-6393");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/No license found/);
  });

  test("email domain comparison is case-insensitive", async () => {
    mockSbOk({ status: "ok", id: "corp-uuid", company_name: "bheckService", max_seats: 5 });
    const result = await verifyCorpMode("BHeckService@Gmail.COM", "0000-0000-0000-6393");
    expect(result.valid).toBe(true);
  });
});
