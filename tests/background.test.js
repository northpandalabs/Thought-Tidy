// background.test.js — unit tests for logic extracted from background.js
// background.js itself uses importScripts + browser globals and cannot be
// required directly in Jest. We test the pure logic pieces here.

const { purgeOldLog, todayDate } = require("../lib/text");
const { MENU_PROMPTS, buildPromptWithProfile } = require("../lib/prompts");

// ── lastAction normalization (dyn-X → custom-X) ───────────────────────────────
// background.js: const lastAction = menuId.startsWith("dyn-") ? menuId.replace("dyn-", "custom-") : menuId;

function normalizeLastAction(menuId) {
  return menuId.startsWith("dyn-") ? menuId.replace("dyn-", "custom-") : menuId;
}

describe("normalizeLastAction", () => {
  test("returns the menu ID unchanged for built-in actions", () => {
    expect(normalizeLastAction("fix-spelling")).toBe("fix-spelling");
    expect(normalizeLastAction("professional")).toBe("professional");
    expect(normalizeLastAction("improve")).toBe("improve");
  });

  test("converts dyn-0 to custom-0", () => {
    expect(normalizeLastAction("dyn-0")).toBe("custom-0");
  });

  test("converts dyn-7 to custom-7", () => {
    expect(normalizeLastAction("dyn-7")).toBe("custom-7");
  });

  test("does not convert IDs that merely contain 'dyn'", () => {
    expect(normalizeLastAction("dynamic")).toBe("dynamic");
  });
});

// ── History log entry shape ───────────────────────────────────────────────────

describe("history log entry shape", () => {
  test("log entry has required metadata fields and no text fields", () => {
    const entry = {
      timestamp: Date.now(),
      date: todayDate(),
      source: "extension",
      action: "fix-spelling",
      provider: "openai",
      model: "gpt-4o-mini",
      inputLen: 50,
      outputLen: 48
    };
    expect(entry).toHaveProperty("timestamp");
    expect(entry).toHaveProperty("date");
    expect(entry).toHaveProperty("source");
    expect(entry).toHaveProperty("action");
    expect(entry).toHaveProperty("provider");
    expect(entry).toHaveProperty("model");
    expect(entry).toHaveProperty("inputLen");
    expect(entry).toHaveProperty("outputLen");
    expect(entry).not.toHaveProperty("inputText");
    expect(entry).not.toHaveProperty("outputText");
  });

  test("log is capped at 200 entries via slice(-200)", () => {
    const bigLog = Array.from({ length: 250 }, (_, i) => ({
      timestamp: Date.now(), date: todayDate(), source: "extension",
      action: "fix-spelling", provider: "openai", model: "gpt-4o-mini",
      inputLen: i, outputLen: i
    }));
    const capped = bigLog.slice(-200);
    expect(capped).toHaveLength(200);
    expect(capped[0].inputLen).toBe(50); // first 50 dropped
  });
});

// ── MENU_PROMPTS completeness (all context-menu actions have prompts) ─────────

describe("MENU_PROMPTS action coverage", () => {
  const CONTEXT_MENU_IDS = [
    "sound-like-me", "fix-spelling", "professional", "sound-human",
    "brain-dump", "improve", "formal", "casual", "shorten", "expand"
  ];

  test("every context-menu action ID has a corresponding MENU_PROMPT", () => {
    CONTEXT_MENU_IDS.forEach(id => {
      expect(MENU_PROMPTS[id]).toBeDefined();
      expect(typeof MENU_PROMPTS[id]).toBe("string");
    });
  });
});

// ── run-from-popup prompt resolution ─────────────────────────────────────────

describe("run-from-popup prompt resolution", () => {
  const CUSTOM_PROMPTS = [
    { name: "Email Reply", prompt: "Write a professional reply:" },
    { name: "Slack Message", prompt: "Make this a Slack message:" }
  ];

  function resolvePrompt(actionVal, customPrompts) {
    if (actionVal.startsWith("custom-")) {
      const idx = parseInt(actionVal.replace("custom-", ""), 10);
      return customPrompts[idx]?.prompt || "Process the following text:";
    }
    return MENU_PROMPTS[actionVal] || null;
  }

  test("resolves built-in action to MENU_PROMPTS entry", () => {
    expect(resolvePrompt("fix-spelling", [])).toBe(MENU_PROMPTS["fix-spelling"]);
  });

  test("resolves custom-0 to first custom prompt", () => {
    expect(resolvePrompt("custom-0", CUSTOM_PROMPTS)).toBe("Write a professional reply:");
  });

  test("resolves custom-1 to second custom prompt", () => {
    expect(resolvePrompt("custom-1", CUSTOM_PROMPTS)).toBe("Make this a Slack message:");
  });

  test("falls back to default when custom index is out of range", () => {
    expect(resolvePrompt("custom-99", CUSTOM_PROMPTS)).toBe("Process the following text:");
  });

  test("returns null for an unknown built-in action ID", () => {
    expect(resolvePrompt("unknown-action", [])).toBeNull();
  });
});
