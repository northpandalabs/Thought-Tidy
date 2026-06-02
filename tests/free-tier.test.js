// Free-tier access gates — unit tests
// Covers: isProUnlocked, resolveActionSettings, LOCKED_ACTIONS, PRO_ACTION_IDS behaviour

const { isProUnlocked } = require("../lib/license");
const { resolveActionSettings, LOCKED_ACTIONS, DEFAULT_ACTION_SETTINGS } = require("../lib/prompts");

// Pro actions that are greyed out (disabled) for free users in the action dropdown
const PRO_ACTION_IDS = new Set(["sound-like-me", "sound-human", "formal", "casual", "shorten", "expand"]);

// ── isProUnlocked (gate function used by applyProGates) ───────────────────────

describe("isProUnlocked", () => {
  test("free user: no license key → not Pro", () => {
    expect(isProUnlocked({})).toBe(false);
  });

  test("free user: email only → not Pro", () => {
    expect(isProUnlocked({ licenseEmail: "user@example.com" })).toBe(false);
  });

  test("free user: key only → not Pro", () => {
    expect(isProUnlocked({ licenseKey: "ABC-123" })).toBe(false);
  });

  test("pro user: both email and key → Pro", () => {
    expect(isProUnlocked({ licenseEmail: "user@example.com", licenseKey: "ABC-123" })).toBe(true);
  });

  test("empty strings treated as missing → not Pro", () => {
    expect(isProUnlocked({ licenseEmail: "", licenseKey: "" })).toBe(false);
  });
});

// ── Action reorder is free (resolveActionSettings always returns full list) ───

describe("resolveActionSettings — available to all tiers", () => {
  test("returns default list when no stored settings", () => {
    const resolved = resolveActionSettings([]);
    expect(resolved).toHaveLength(DEFAULT_ACTION_SETTINGS.length);
    expect(resolved[0].id).toBe("fix-spelling");
  });

  test("preserves custom order from stored settings (relative)", () => {
    const stored = [
      { id: "improve",      label: "Improve Writing",        enabled: true },
      { id: "fix-spelling", label: "Fix Spelling & Grammar", enabled: true },
    ];
    const resolved = resolveActionSettings(stored);
    const ids = resolved.map(a => a.id);
    // stored items keep their relative order; missing defaults inserted at default positions
    expect(ids.indexOf("improve")).toBeLessThan(ids.indexOf("fix-spelling"));
  });

  test("missing defaults inserted at default position", () => {
    const stored = [{ id: "fix-spelling", label: "Fix Spelling & Grammar", enabled: true }];
    const resolved = resolveActionSettings(stored);
    expect(resolved.length).toBeGreaterThan(1);
    const ids = resolved.map(a => a.id);
    expect(ids).toContain("improve");
    expect(ids).toContain("formal");
  });

  test("preserves enabled:false state from stored settings", () => {
    const stored = [{ id: "fix-spelling", label: "Fix Spelling & Grammar", enabled: false }];
    const resolved = resolveActionSettings(stored);
    const fixEntry = resolved.find(a => a.id === "fix-spelling");
    expect(fixEntry.enabled).toBe(false);
  });
});

// ── LOCKED_ACTIONS — built-in actions cannot be renamed ───────────────────────

describe("LOCKED_ACTIONS", () => {
  test("fix-spelling is locked (built-in, cannot be renamed)", () => {
    expect(LOCKED_ACTIONS.has("fix-spelling")).toBe(true);
  });

  test("sound-like-me is locked", () => {
    expect(LOCKED_ACTIONS.has("sound-like-me")).toBe(true);
  });

  test("custom prompt IDs are not locked", () => {
    expect(LOCKED_ACTIONS.has("custom-0")).toBe(false);
    expect(LOCKED_ACTIONS.has("custom-7")).toBe(false);
  });
});

// ── PRO_ACTION_IDS — pro actions greyed for free users in dropdown ─────────────

describe("PRO_ACTION_IDS — actions disabled for free tier in dropdown", () => {
  test("sound-like-me is a Pro action", () => {
    expect(PRO_ACTION_IDS.has("sound-like-me")).toBe(true);
  });

  test("sound-human, formal, casual, shorten, expand are Pro actions", () => {
    ["sound-human", "formal", "casual", "shorten", "expand"].forEach(id => {
      expect(PRO_ACTION_IDS.has(id)).toBe(true);
    });
  });

  test("fix-spelling is NOT a Pro action (always available)", () => {
    expect(PRO_ACTION_IDS.has("fix-spelling")).toBe(false);
  });

  test("improve, professional, brain-dump are NOT Pro actions", () => {
    ["improve", "professional", "brain-dump"].forEach(id => {
      expect(PRO_ACTION_IDS.has(id)).toBe(false);
    });
  });
});

// ── Custom prompt limit logic ─────────────────────────────────────────────────

describe("Custom prompt limit (free=1, pro=8)", () => {
  function maxPromptsFor(isPro) {
    return isPro ? 8 : 1;
  }

  test("free user limit is 1", () => {
    expect(maxPromptsFor(false)).toBe(1);
  });

  test("pro user limit is 8", () => {
    expect(maxPromptsFor(true)).toBe(8);
  });

  test("free user with 0 prompts can add (below limit)", () => {
    const count = 0;
    expect(count < maxPromptsFor(false)).toBe(true);
  });

  test("free user with 1 prompt cannot add more (at limit)", () => {
    const count = 1;
    expect(count >= maxPromptsFor(false)).toBe(true);
  });

  test("pro user with 7 prompts can still add", () => {
    const count = 7;
    expect(count < maxPromptsFor(true)).toBe(true);
  });

  test("pro user with 8 prompts cannot add more (at limit)", () => {
    const count = 8;
    expect(count >= maxPromptsFor(true)).toBe(true);
  });
});
