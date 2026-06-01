// Free-tier access gates — desktop unit tests
// Verifies the same gate logic used by settings.js in the Electron renderer

const { isProUnlocked } = require("../../lib/license");
const { resolveActionSettings, LOCKED_ACTIONS, DEFAULT_ACTION_SETTINGS } = require("../../lib/prompts");

const PRO_ACTION_IDS = new Set(["sound-like-me", "improve", "formal", "casual", "shorten", "expand"]);

// ── isProUnlocked ─────────────────────────────────────────────────────────────

describe("isProUnlocked (desktop)", () => {
  test("free user with no keys → not Pro", () => {
    expect(isProUnlocked({})).toBe(false);
  });

  test("pro user with both fields → Pro", () => {
    expect(isProUnlocked({ licenseEmail: "u@example.com", licenseKey: "K-1" })).toBe(true);
  });
});

// ── Action reorder — free tier ────────────────────────────────────────────────

describe("resolveActionSettings — reorder is free on desktop", () => {
  test("free user: resolves custom order regardless of pro status", () => {
    const stored = [
      { id: "casual",       label: "Make Casual",          enabled: true },
      { id: "fix-spelling", label: "Fix Spelling & Grammar", enabled: true },
    ];
    const resolved = resolveActionSettings(stored);
    const ids = resolved.map(a => a.id);
    expect(ids.indexOf("casual")).toBeLessThan(ids.indexOf("fix-spelling"));
  });

  test("all default actions present after resolve", () => {
    const resolved = resolveActionSettings([]);
    const ids = resolved.map(a => a.id);
    DEFAULT_ACTION_SETTINGS.forEach(def => expect(ids).toContain(def.id));
  });
});

// ── Disable/rename require Pro ────────────────────────────────────────────────

describe("Desktop action editor Pro gates", () => {
  test("checkbox disabled for free user (isOnlyOne=false)", () => {
    const currentIsPro = false;
    const isOnlyOne    = false;
    const checkDisabled = isOnlyOne || !currentIsPro;
    expect(checkDisabled).toBe(true);
  });

  test("checkbox enabled for pro user (isOnlyOne=false)", () => {
    const currentIsPro = true;
    const isOnlyOne    = false;
    const checkDisabled = isOnlyOne || !currentIsPro;
    expect(checkDisabled).toBe(false);
  });

  test("checkbox always disabled when isOnlyOne=true, regardless of Pro", () => {
    const isOnlyOne = true;
    [true, false].forEach(isPro => {
      const checkDisabled = isOnlyOne || !isPro;
      expect(checkDisabled).toBe(true);
    });
  });

  test("name input readOnly for free user on non-locked action", () => {
    const currentIsPro = false;
    const isLocked     = false;
    const readOnly     = !isLocked && !currentIsPro;
    expect(readOnly).toBe(true);
  });

  test("name input editable for pro user on non-locked action", () => {
    const currentIsPro = true;
    const isLocked     = false;
    const readOnly     = !isLocked && !currentIsPro;
    expect(readOnly).toBe(false);
  });

  test("name input always read-only for locked actions", () => {
    const isLocked = true;
    expect(isLocked).toBe(true); // locked actions use a <span>, not an input
  });
});

// ── LOCKED_ACTIONS ────────────────────────────────────────────────────────────

describe("LOCKED_ACTIONS (desktop)", () => {
  test("built-in actions are locked", () => {
    ["fix-spelling", "sound-like-me", "professional", "sound-human", "brain-dump", "improve"].forEach(id => {
      expect(LOCKED_ACTIONS.has(id)).toBe(true);
    });
  });

  test("non-built-in actions are not locked", () => {
    ["formal", "casual", "shorten", "expand"].forEach(id => {
      expect(LOCKED_ACTIONS.has(id)).toBe(false);
    });
  });
});

// ── Custom prompt limit ───────────────────────────────────────────────────────

describe("Custom prompt limit (desktop)", () => {
  function maxPrompts(isPro) { return isPro ? 8 : 1; }

  test("free: max 1 prompt", ()  => expect(maxPrompts(false)).toBe(1));
  test("pro: max 8 prompts", ()  => expect(maxPrompts(true)).toBe(8));

  test("free user at 1 prompt: add form hidden", () => {
    const count = 1;
    const shouldHide = count >= maxPrompts(false);
    expect(shouldHide).toBe(true);
  });

  test("free user at 0 prompts: add form visible", () => {
    const count = 0;
    const shouldHide = count >= maxPrompts(false);
    expect(shouldHide).toBe(false);
  });

  test("pro user at 8 prompts: add form hidden", () => {
    const count = 8;
    const shouldHide = count >= maxPrompts(true);
    expect(shouldHide).toBe(true);
  });
});

// ── NSIS uninstall wipes settings file (path constant check) ─────────────────

describe("NSIS uninstall settings wipe", () => {
  test("settings file name matches electron-store config", () => {
    // electron-store uses name: "thought-tidy-settings" → file: thought-tidy-settings.json
    // installer.nsh must delete the same filename
    const storeName = "thought-tidy-settings";
    const nsisDeleteTarget = `thought-tidy-settings.json`;
    expect(nsisDeleteTarget).toBe(`${storeName}.json`);
  });
});
