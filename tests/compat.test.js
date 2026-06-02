// Cross-platform compatibility tests
// Guards behavior that is known to differ between Chrome/V8, Firefox/SpiderMonkey,
// and Electron on Windows / macOS / Linux.
// Each describe block is annotated with the platform risk it covers.

const { wordCount, esc, escHtml, uid, todayDate, purgeOldLog } = require("../lib/text");
const { isRetriable } = require("../lib/api");

// ── isRetriable — real-world error string patterns ────────────────────────────
// Risk: Chrome, Firefox, Electron (all).
// OpenAI, Anthropic, and Gemini each format 429/rate-limit errors differently.
// The regex must match all separator variants including no separator ("ratelimit").
// Old regex /rate.limi/ required a character between "rate" and "limi",
// so "ratelimit" (no separator) silently fell through and was not retried.

describe("isRetriable — error string patterns", () => {
  test("matches 'ratelimit' with no separator (OpenAI 429 code field)", () => {
    expect(isRetriable("ratelimit exceeded")).toBe(true);
  });
  test("matches 'rate_limit' with underscore", () => {
    expect(isRetriable("error code: rate_limit")).toBe(true);
  });
  test("matches 'rate limit' with space", () => {
    expect(isRetriable("rate limit exceeded")).toBe(true);
  });
  test("matches 'rate-limit' with hyphen", () => {
    expect(isRetriable("rate-limit reached")).toBe(true);
  });
  test("matches 'RateLimit' PascalCase (some SDK wrappers)", () => {
    expect(isRetriable("RateLimit exceeded")).toBe(true);
  });
  test("matches 429 numeric code", () => {
    expect(isRetriable("HTTP 429 Too Many Requests")).toBe(true);
  });
  test("matches 503", () => {
    expect(isRetriable("503 Service Unavailable")).toBe(true);
  });
  test("matches overloaded", () => {
    expect(isRetriable("model is overloaded")).toBe(true);
  });
  test("matches quota", () => {
    expect(isRetriable("quota exceeded")).toBe(true);
  });
  test("does not match 401 auth errors", () => {
    expect(isRetriable("401 Unauthorized: Invalid API key")).toBe(false);
  });
  test("does not match 400 bad request", () => {
    expect(isRetriable("400 Bad Request: Invalid model")).toBe(false);
  });
  test("does not match empty string", () => {
    expect(isRetriable("")).toBe(false);
  });
  test("does not match null/undefined", () => {
    expect(isRetriable(null)).toBe(false);
    expect(isRetriable(undefined)).toBe(false);
  });
});

// ── wordCount — Unicode whitespace (Chrome/V8 vs Firefox/SpiderMonkey) ────────
// Risk: Firefox ESR <78 did not match U+00A0 with \s. Modern versions do.
// ECMA-262 requires \s to match WhiteSpace (which includes U+00A0, U+2003, etc.)
// so this documents the expected cross-engine behavior.

describe("wordCount — Unicode whitespace", () => {
  test("splits on U+00A0 non-breaking space (Firefox/Chrome parity)", () => {
    expect(wordCount("hello world")).toBe(2);
  });
  test("splits on U+2003 em-space", () => {
    expect(wordCount("hello world")).toBe(2);
  });
  test("splits on U+2009 thin-space", () => {
    expect(wordCount("hello world")).toBe(2);
  });
  test("splits on U+200A hair-space", () => {
    expect(wordCount("hello world")).toBe(2);
  });
  test("counts correctly with mixed ASCII and Unicode whitespace", () => {
    expect(wordCount("one two three four")).toBe(4);
  });
});

// ── uid — output stability (all platforms, V8 edge case) ──────────────────────
// Risk: All platforms.
// Math.random().toString(36).slice(2,9) produces a shorter-than-7 string if
// Math.random() returns a value whose base-36 fraction is under 7 digits
// (e.g. exactly 0.5 → "0.i", slice gives "i"). Astronomically unlikely with
// V8's Xorshift128+ PRNG but worth stress-testing across 1000 calls.

describe("uid — length and format stability", () => {
  test("always returns exactly 7 characters across 1000 calls", () => {
    for (let i = 0; i < 1000; i++) {
      expect(uid()).toHaveLength(7);
    }
  });
  test("always returns only lowercase base-36 chars [a-z0-9]", () => {
    for (let i = 0; i < 500; i++) {
      expect(uid()).toMatch(/^[a-z0-9]{7}$/);
    }
  });
  test("generates unique ids across 500 calls", () => {
    const ids = Array.from({ length: 500 }, uid);
    expect(new Set(ids).size).toBe(500);
  });
});

// ── todayDate — YYYY-MM-DD format (Windows / macOS / Linux / UTC offsets) ─────
// Risk: All OS timezones, particularly UTC-negative machines where local midnight
// lags UTC midnight. todayDate() uses local time, so it is always correct for the
// local user — but tests running in CI (UTC) versus a dev machine (UTC-6) will see
// different values. Tests must not assume a specific date, only the format.

describe("todayDate — format and range correctness", () => {
  test("returns YYYY-MM-DD format", () => {
    expect(todayDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  test("zero-pads single-digit month to 2 digits", () => {
    const [, month] = todayDate().split("-");
    expect(month).toHaveLength(2);
  });
  test("zero-pads single-digit day to 2 digits", () => {
    const [,, day] = todayDate().split("-");
    expect(day).toHaveLength(2);
  });
  test("month is in valid range 01–12", () => {
    const [, month] = todayDate().split("-");
    const m = parseInt(month, 10);
    expect(m).toBeGreaterThanOrEqual(1);
    expect(m).toBeLessThanOrEqual(12);
  });
  test("day is in valid range 01–31", () => {
    const [,, day] = todayDate().split("-");
    const d = parseInt(day, 10);
    expect(d).toBeGreaterThanOrEqual(1);
    expect(d).toBeLessThanOrEqual(31);
  });
  test("year is a plausible 4-digit year", () => {
    const [year] = todayDate().split("-");
    const y = parseInt(year, 10);
    expect(y).toBeGreaterThanOrEqual(2025);
    expect(y).toBeLessThan(2100);
  });
});

// ── purgeOldLog — date boundary behavior (all OS timezones) ───────────────────
// Risk: All platforms, especially UTC-negative machines at midnight.
// purgeOldLog uses todayDate() (local time). An entry recorded at 11:58 PM local
// and purged at 12:01 AM local will be correctly dropped. But an entry's date
// field must match exactly — edge cases: null/undefined/missing date fields.

describe("purgeOldLog — date boundary and robustness", () => {
  test("drops entries with a hard-coded past date", () => {
    expect(purgeOldLog([{ date: "2020-01-01", action: "fix-spelling" }])).toHaveLength(0);
  });
  test("drops entries with a far future date (guards clock skew)", () => {
    expect(purgeOldLog([{ date: "2099-12-31", action: "fix-spelling" }])).toHaveLength(0);
  });
  test("drops entries with null date field", () => {
    expect(purgeOldLog([{ date: null, action: "fix-spelling" }])).toHaveLength(0);
  });
  test("drops entries with undefined date field", () => {
    expect(purgeOldLog([{ date: undefined, action: "fix-spelling" }])).toHaveLength(0);
  });
  test("drops entries with empty string date", () => {
    expect(purgeOldLog([{ date: "", action: "fix-spelling" }])).toHaveLength(0);
  });
  test("drops entries missing the date property entirely", () => {
    expect(purgeOldLog([{ action: "fix-spelling" }])).toHaveLength(0);
  });
  test("keeps entries whose date matches todayDate()", () => {
    const today = todayDate();
    const result = purgeOldLog([{ date: today, action: "fix-spelling" }]);
    expect(result).toHaveLength(1);
  });
  test("handles mix of today and old entries", () => {
    const today = todayDate();
    const entries = [
      { date: today,        action: "fix-spelling" },
      { date: "2020-01-01", action: "professional" },
      { date: null,         action: "shorten" },
    ];
    const result = purgeOldLog(entries);
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe("fix-spelling");
  });
});

// ── esc / escHtml — Unicode, emoji, and surrogate pairs (all platforms) ────────
// Risk: Windows (UTF-16 surrogate pairs in JS strings), all platforms.
// Emoji above U+FFFF are represented as surrogate pairs in JS strings.
// esc() and escHtml() must pass them through without corruption or double-escaping.
// Critical because action names, model names, and user profile text can contain emoji.

describe("esc — Unicode and emoji passthrough", () => {
  test("passes through emoji unchanged", () => {
    expect(esc("hello 🎉 world")).toBe("hello 🎉 world");
  });
  test("passes through CJK characters unchanged", () => {
    expect(esc("你好世界")).toBe("你好世界");
  });
  test("passes through Arabic/RTL text unchanged", () => {
    expect(esc("مرحبا")).toBe("مرحبا");
  });
  test("passes through emoji with surrogate pair (U+1F600)", () => {
    const emoji = "😀";
    expect(esc(emoji)).toBe(emoji);
  });
  test("escapes < > & correctly in mixed Unicode string", () => {
    expect(esc("<你好 & 世界>")).toBe("&lt;你好 &amp; 世界&gt;");
  });
  test("converts newline to <br> in emoji string", () => {
    expect(esc("🎉\nhello")).toBe("🎉<br>hello");
  });
});

describe("escHtml — Unicode in attribute values", () => {
  test("passes through emoji in attribute context", () => {
    expect(escHtml("label 🛠")).toBe("label 🛠");
  });
  test("escapes double quotes around emoji", () => {
    expect(escHtml('"🎉"')).toBe("&quot;🎉&quot;");
  });
  test("passes through surrogate-pair emoji (U+1F600 😀)", () => {
    const emoji = "😀";
    expect(escHtml(emoji)).toBe(emoji);
  });
  test("passes through CJK in attribute context", () => {
    expect(escHtml("你好")).toBe("你好");
  });
  test("escapes & < > in Unicode string", () => {
    expect(escHtml("<你好>&")).toBe("&lt;你好&gt;&amp;");
  });
});

// ── btoa spread — call stack argument limit (Chrome/V8 vs Firefox/SpiderMonkey) ─
// Risk: Chrome/V8 extension service worker.
// V8 has a ~65,536 argument limit on variadic calls (Function.prototype.apply).
// crypto-storage.js uses btoa(String.fromCharCode(...new Uint8Array(buf))) to
// encode the IV+ciphertext. For a 32-byte AES-256-GCM key export this is safe.
// For encrypted payloads the buf is 12 (IV) + ciphertext bytes. Typical short
// prompts/keys are well under 1 KB — always safe. This test documents the safe range.

describe("btoa spread — Uint8Array argument limit", () => {
  test("32-byte key export spread is safe (AES-256-GCM key size)", () => {
    const buf = new Uint8Array(32).fill(0x41);
    expect(() => btoa(String.fromCharCode(...buf))).not.toThrow();
  });
  test("12+256 byte IV+ciphertext spread is safe (typical short text)", () => {
    const buf = new Uint8Array(268).fill(0x41);
    expect(() => btoa(String.fromCharCode(...buf))).not.toThrow();
  });
  test("4 KB payload spread is safe (largest realistic API key + padding)", () => {
    const buf = new Uint8Array(4096).fill(0x41);
    expect(() => btoa(String.fromCharCode(...buf))).not.toThrow();
  });
  test("btoa output for known input is correct (cross-engine parity)", () => {
    const buf = new Uint8Array([72, 101, 108, 108, 111]);
    expect(btoa(String.fromCharCode(...buf))).toBe("SGVsbG8=");
  });
});
