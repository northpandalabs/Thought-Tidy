// Tests that lib-node/ wrappers correctly re-export the shared lib/ functions
// and that those functions behave identically when called from Node.js.

// ── lib-node/api.js ────────────────────────────────────────────────────────────

describe("lib-node/api.js", () => {
  const api = require("../lib-node/api");

  test("exports callAI",     () => expect(typeof api.callAI).toBe("function"));
  test("exports callOpenAI", () => expect(typeof api.callOpenAI).toBe("function"));
  test("exports callClaude", () => expect(typeof api.callClaude).toBe("function"));
  test("exports callGemini", () => expect(typeof api.callGemini).toBe("function"));

  describe("callAI routing works in Node.js (fetch mocked)", () => {
    beforeEach(() => { global.fetch = jest.fn(); });
    afterEach(() => { jest.clearAllMocks(); });

    test("routes 'openai' to the OpenAI endpoint", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "ok" } }] })
      });
      await api.callAI("openai", { openaiKey: "sk-x", openaiModel: "gpt-4o-mini" }, "Fix:", "text");
      expect(global.fetch.mock.calls[0][0]).toBe("https://api.openai.com/v1/chat/completions");
    });

    test("routes 'claude' to the Anthropic endpoint", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ content: [{ text: "ok" }] })
      });
      await api.callAI("claude", { claudeKey: "sk-ant-x", claudeModel: "claude-haiku-4-5-20251001" }, "Fix:", "text");
      expect(global.fetch.mock.calls[0][0]).toBe("https://api.anthropic.com/v1/messages");
    });

    test("routes 'gemini' to the Gemini endpoint", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: "ok" }] } }] })
      });
      await api.callAI("gemini", { geminiKey: "AIza-x", geminiModel: "gemini-2.0-flash" }, "Fix:", "text");
      expect(global.fetch.mock.calls[0][0]).toContain("generativelanguage.googleapis.com");
    });

    test("throws for unknown provider", async () => {
      await expect(api.callAI("mystery-ai", {}, "Fix:", "text"))
        .rejects.toThrow('Unknown provider "mystery-ai"');
    });
  });
});

// ── lib-node/prompts.js ────────────────────────────────────────────────────────

describe("lib-node/prompts.js", () => {
  const { MENU_PROMPTS, buildPromptWithProfile } = require("../lib-node/prompts");

  test("exports MENU_PROMPTS as a non-empty object", () => {
    expect(typeof MENU_PROMPTS).toBe("object");
    expect(Object.keys(MENU_PROMPTS).length).toBeGreaterThan(0);
  });

  test("exports buildPromptWithProfile as a function", () => {
    expect(typeof buildPromptWithProfile).toBe("function");
  });

  test("all 10 built-in actions have a prompt defined", () => {
    const required = [
      "fix-spelling", "sound-like-me", "professional", "sound-human",
      "brain-dump", "improve", "formal", "casual", "shorten", "expand"
    ];
    for (const key of required) {
      expect(typeof MENU_PROMPTS[key]).toBe("string");
      expect(MENU_PROMPTS[key].length).toBeGreaterThan(10);
    }
  });

  test("each prompt ends with a colon (instructs AI to return only the result)", () => {
    for (const [key, prompt] of Object.entries(MENU_PROMPTS)) {
      expect(prompt.trim().endsWith(":")).toBe(true);
    }
  });

  test("buildPromptWithProfile returns base prompt unchanged when profile is disabled", () => {
    const result = buildPromptWithProfile("Fix this:", { profileEnabled: false, profileName: "Bailey" });
    expect(result).toBe("Fix this:");
  });

  test("buildPromptWithProfile prepends profile info when enabled", () => {
    const result = buildPromptWithProfile("Fix this:", {
      profileEnabled: true,
      profileName: "Bailey",
      profileRole: "Developer"
    });
    expect(result).toContain("Bailey");
    expect(result).toContain("Developer");
    expect(result).toContain("Fix this:");
    expect(result.indexOf("Bailey")).toBeLessThan(result.indexOf("Fix this:"));
  });

  test("buildPromptWithProfile ignores empty profile fields", () => {
    const result = buildPromptWithProfile("Fix this:", {
      profileEnabled: true,
      profileName: "",
      profileRole: "",
      profileStyle: "",
      profileContext: ""
    });
    expect(result).toBe("Fix this:");
  });
});
