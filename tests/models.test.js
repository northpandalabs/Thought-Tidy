const {
  fetchOpenAIModels, fetchClaudeModels, fetchGeminiModels, fetchOllamaModels, fetchGitHubCopilotModels,
  testOpenAI, testClaude, testGemini, testOllama, testGitHubCopilot,
  isModelCacheStale, formatCacheAge, MODEL_CACHE_STALE_MS,
  costTier,
} = require("../lib/models");

beforeEach(() => { global.fetch = jest.fn(); });
afterEach(() => { jest.clearAllMocks(); });

// ── fetchOpenAIModels ─────────────────────────────────────────────────────────

describe("fetchOpenAIModels", () => {
  const MODELS = [
    { id: "gpt-4o",           created: 1700000004 },
    { id: "gpt-4o-mini",      created: 1700000003 },
    { id: "o1-mini",          created: 1700000002 },
    { id: "text-embedding-3", created: 1700000001 }, // should be filtered out
    { id: "whisper-1",        created: 1700000000 }, // should be filtered out
    { id: "dall-e-3",         created: 1699999999 }, // should be filtered out
    { id: "gpt-4o-audio",     created: 1699999998 }, // should be filtered out (audio)
    { id: "gpt-4o-realtime",  created: 1699999997 }, // should be filtered out (realtime)
  ];

  test("throws with error message on non-ok response", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, statusText: "Unauthorized",
      json: async () => ({ error: { message: "Invalid key" } })
    });
    await expect(fetchOpenAIModels("bad-key")).rejects.toThrow("Invalid key");
  });

  test("filters out embedding, whisper, dall-e, audio, and realtime models", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: MODELS }) });
    const result = await fetchOpenAIModels("sk-test");
    const ids = result.map(m => m.id);
    expect(ids).not.toContain("text-embedding-3");
    expect(ids).not.toContain("whisper-1");
    expect(ids).not.toContain("dall-e-3");
    expect(ids).not.toContain("gpt-4o-audio");
    expect(ids).not.toContain("gpt-4o-realtime");
  });

  test("keeps gpt-4o, gpt-4o-mini, and o1-mini", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: MODELS }) });
    const result = await fetchOpenAIModels("sk-test");
    const ids = result.map(m => m.id);
    expect(ids).toContain("gpt-4o");
    expect(ids).toContain("gpt-4o-mini");
    expect(ids).toContain("o1-mini");
  });

  test("sorts models by created date descending (newest first)", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: MODELS }) });
    const result = await fetchOpenAIModels("sk-test");
    expect(result[0].id).toBe("gpt-4o");
  });

  test("returns objects with id and label fields", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, json: async () => ({ data: [{ id: "gpt-4o", created: 1 }] })
    });
    const result = await fetchOpenAIModels("sk-test");
    expect(result[0]).toHaveProperty("id", "gpt-4o");
    expect(result[0]).toHaveProperty("label", "gpt-4o");
  });
});

// ── fetchClaudeModels ─────────────────────────────────────────────────────────

describe("fetchClaudeModels", () => {
  test("throws with error message on non-ok response", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, statusText: "Unauthorized",
      json: async () => ({ error: { message: "Invalid x-api-key" } })
    });
    await expect(fetchClaudeModels("bad-key")).rejects.toThrow("Invalid x-api-key");
  });

  test("returns models mapped to id and label", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "claude-haiku-4-5-20251001", display_name: "Claude Haiku 4.5" },
          { id: "claude-sonnet-4-6",         display_name: "Claude Sonnet 4.6" }
        ]
      })
    });
    const result = await fetchClaudeModels("sk-ant-test");
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" });
  });

  test("falls back to id as label when display_name is missing", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "claude-opus-4-7" }] })
    });
    const result = await fetchClaudeModels("sk-ant-test");
    expect(result[0].label).toBe("claude-opus-4-7");
  });

  test("returns empty array when data is missing from response", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    const result = await fetchClaudeModels("sk-ant-test");
    expect(result).toEqual([]);
  });
});

// ── fetchGeminiModels ─────────────────────────────────────────────────────────

describe("fetchGeminiModels", () => {
  const GEMINI_MODELS = [
    { name: "models/gemini-2.0-flash",   displayName: "Gemini 2.0 Flash",   supportedGenerationMethods: ["generateContent", "countTokens"] },
    { name: "models/gemini-1.5-pro",     displayName: "Gemini 1.5 Pro",     supportedGenerationMethods: ["generateContent"] },
    { name: "models/embedding-001",      displayName: "Embedding 001",       supportedGenerationMethods: ["embedContent"] }, // no generateContent
    { name: "models/text-bison-001",     displayName: "PaLM 2",             supportedGenerationMethods: ["generateText"] }, // no generateContent
  ];

  test("throws with error message on non-ok response", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, statusText: "Bad Request",
      json: async () => ({ error: { message: "API key not valid." } })
    });
    await expect(fetchGeminiModels("bad-key")).rejects.toThrow("API key not valid.");
  });

  test("filters to only models that support generateContent", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ models: GEMINI_MODELS }) });
    const result = await fetchGeminiModels("AIza-test");
    const ids = result.map(m => m.id);
    expect(ids).toContain("gemini-2.0-flash");
    expect(ids).toContain("gemini-1.5-pro");
    expect(ids).not.toContain("embedding-001");
    expect(ids).not.toContain("text-bison-001");
  });

  test("strips the 'models/' prefix from model IDs", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ models: GEMINI_MODELS }) });
    const result = await fetchGeminiModels("AIza-test");
    result.forEach(m => {
      expect(m.id).not.toMatch(/^models\//);
    });
  });

  test("uses displayName as label", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ models: [GEMINI_MODELS[0]] }) });
    const result = await fetchGeminiModels("AIza-test");
    expect(result[0].label).toBe("Gemini 2.0 Flash");
  });

  test("returns empty array when models field is missing", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    const result = await fetchGeminiModels("AIza-test");
    expect(result).toEqual([]);
  });
});

// ── fetchOllamaModels ─────────────────────────────────────────────────────────

describe("fetchOllamaModels", () => {
  const OLLAMA_TAGS = {
    models: [
      { name: "llama3.2:latest" },
      { name: "mistral:7b" },
      { name: "phi4:latest" }
    ]
  };

  test("fetches from /api/tags on the configured base URL", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => OLLAMA_TAGS });
    await fetchOllamaModels("http://localhost:11434");
    expect(global.fetch.mock.calls[0][0]).toBe("http://localhost:11434/api/tags");
  });

  test("strips trailing slash from base URL before building endpoint", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => OLLAMA_TAGS });
    await fetchOllamaModels("http://localhost:11434/");
    expect(global.fetch.mock.calls[0][0]).toBe("http://localhost:11434/api/tags");
  });

  test("defaults to localhost:11434 when baseUrl is falsy", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => OLLAMA_TAGS });
    await fetchOllamaModels(null);
    expect(global.fetch.mock.calls[0][0]).toBe("http://localhost:11434/api/tags");
  });

  test("returns [{id, label}] array from models response", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => OLLAMA_TAGS });
    const result = await fetchOllamaModels("http://localhost:11434");
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ id: "llama3.2:latest", label: "llama3.2:latest" });
    expect(result[1]).toEqual({ id: "mistral:7b",      label: "mistral:7b" });
  });

  test("throws descriptive error when status is not ok", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    await expect(fetchOllamaModels("http://localhost:11434"))
      .rejects.toThrow("Ollama /api/tags returned 500");
  });

  test("throws descriptive error when models array is empty", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ models: [] }) });
    await expect(fetchOllamaModels("http://localhost:11434"))
      .rejects.toThrow("No models found");
  });

  test("works with a remote base URL", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => OLLAMA_TAGS });
    await fetchOllamaModels("http://192.168.1.50:11434");
    expect(global.fetch.mock.calls[0][0]).toBe("http://192.168.1.50:11434/api/tags");
  });
});

// ── testOllama ────────────────────────────────────────────────────────────────

describe("testOllama", () => {
  test("always returns true without making a network request", async () => {
    global.fetch = jest.fn();
    const result = await testOllama();
    expect(result).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ── testOpenAI / testClaude / testGemini ──────────────────────────────────────

describe("testOpenAI", () => {
  test("returns true when model responds successfully", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    expect(await testOpenAI("sk-test", "gpt-4o-mini")).toBe(true);
  });

  test("returns false when model returns an error response", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false });
    expect(await testOpenAI("sk-test", "bad-model")).toBe(false);
  });

  test("returns false when fetch throws (network error)", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("Network failure"));
    expect(await testOpenAI("sk-test", "gpt-4o-mini")).toBe(false);
  });

  test("sends max_tokens: 5 to minimise cost", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    await testOpenAI("sk-test", "gpt-4o-mini");
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.max_tokens).toBe(5);
  });
});

describe("testClaude", () => {
  test("returns true when model responds successfully", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    expect(await testClaude("sk-ant-test", "claude-haiku-4-5-20251001")).toBe(true);
  });

  test("returns false on error response", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false });
    expect(await testClaude("sk-ant-test", "bad-model")).toBe(false);
  });

  test("returns false on network error", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("Network failure"));
    expect(await testClaude("sk-ant-test", "claude-haiku-4-5-20251001")).toBe(false);
  });
});

describe("testGemini", () => {
  test("returns true when model responds successfully", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    expect(await testGemini("AIza-test", "gemini-2.0-flash")).toBe(true);
  });

  test("returns false on error response", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false });
    expect(await testGemini("AIza-test", "bad-model")).toBe(false);
  });

  test("returns false on network error", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("Network failure"));
    expect(await testGemini("AIza-test", "gemini-2.0-flash")).toBe(false);
  });

  test("sends maxOutputTokens: 5 to minimise cost", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    await testGemini("AIza-test", "gemini-2.0-flash");
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.generationConfig.maxOutputTokens).toBe(5);
  });
});

// ── fetchGitHubCopilotModels ──────────────────────────────────────────────────

describe("fetchGitHubCopilotModels", () => {
  const COPILOT_MODELS_DATA = [
    { id: "gpt-4o" },
    { id: "gpt-4o-mini" },
    { id: "claude-3.5-sonnet" },
    { id: "text-embedding-ada-002" }, // should be filtered (embedding)
    { id: "whisper-1" },              // should be filtered (audio)
  ];

  test("returns models from data.data field when API succeeds", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: COPILOT_MODELS_DATA })
    });
    const result = await fetchGitHubCopilotModels("ghp_test");
    const ids = result.map(m => m.id);
    expect(ids).toContain("gpt-4o");
    expect(ids).toContain("gpt-4o-mini");
    expect(ids).toContain("claude-3.5-sonnet");
  });

  test("returns models from data.models field as alternative shape", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: [{ id: "gpt-4o" }, { id: "o1-mini" }] })
    });
    const result = await fetchGitHubCopilotModels("ghp_test");
    expect(result.map(m => m.id)).toContain("gpt-4o");
  });

  test("filters out embedding, image, audio, tts, whisper, dall models", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: COPILOT_MODELS_DATA })
    });
    const result = await fetchGitHubCopilotModels("ghp_test");
    const ids = result.map(m => m.id);
    expect(ids).not.toContain("text-embedding-ada-002");
    expect(ids).not.toContain("whisper-1");
  });

  test("falls back to hardcoded list when API returns non-ok status", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false });
    const result = await fetchGitHubCopilotModels("ghp_test");
    expect(result.length).toBeGreaterThan(0);
    expect(result.map(m => m.id)).toContain("gpt-4o");
  });

  test("falls back to hardcoded list when API returns empty model list", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, json: async () => ({ data: [] })
    });
    const result = await fetchGitHubCopilotModels("ghp_test");
    expect(result.length).toBeGreaterThan(0);
    expect(result.map(m => m.id)).toContain("gpt-4o");
  });

  test("falls back to hardcoded list on network error", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("Network failure"));
    const result = await fetchGitHubCopilotModels("ghp_test");
    expect(result.length).toBeGreaterThan(0);
    expect(result.map(m => m.id)).toContain("gpt-4o");
  });

  test("calls the GitHub Copilot models endpoint", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, json: async () => ({ data: [{ id: "gpt-4o" }] })
    });
    await fetchGitHubCopilotModels("ghp_test");
    expect(global.fetch.mock.calls[0][0]).toBe("https://models.inference.ai.azure.com/models");
  });
});

// ── testGitHubCopilot ─────────────────────────────────────────────────────────

describe("testGitHubCopilot", () => {
  test("returns true when model responds successfully", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    expect(await testGitHubCopilot("ghp_test", "gpt-4o")).toBe(true);
  });

  test("returns false on error response", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false });
    expect(await testGitHubCopilot("ghp_test", "bad-model")).toBe(false);
  });

  test("returns false on network error", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("Network failure"));
    expect(await testGitHubCopilot("ghp_test", "gpt-4o")).toBe(false);
  });

  test("calls the GitHub Copilot chat completions endpoint", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    await testGitHubCopilot("ghp_test", "gpt-4o");
    expect(global.fetch.mock.calls[0][0]).toBe("https://models.inference.ai.azure.com/chat/completions");
  });

  test("sends max_tokens: 5 to minimise cost", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    await testGitHubCopilot("ghp_test", "gpt-4o");
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.max_tokens).toBe(5);
  });
});

// ── isModelCacheStale ─────────────────────────────────────────────────────────

describe("isModelCacheStale", () => {
  test("returns true when fetchedAt is 0 (never fetched)", () => {
    expect(isModelCacheStale(0)).toBe(true);
  });

  test("returns true when fetchedAt is null/undefined", () => {
    expect(isModelCacheStale(null)).toBe(true);
    expect(isModelCacheStale(undefined)).toBe(true);
  });

  test("returns false for a timestamp fetched 1 hour ago", () => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    expect(isModelCacheStale(oneHourAgo)).toBe(false);
  });

  test("returns false for a timestamp fetched 6 days ago", () => {
    const sixDaysAgo = Date.now() - 6 * 24 * 60 * 60 * 1000;
    expect(isModelCacheStale(sixDaysAgo)).toBe(false);
  });

  test("returns true for a timestamp older than 7 days", () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    expect(isModelCacheStale(eightDaysAgo)).toBe(true);
  });

  test("returns true for a timestamp exactly at the stale boundary", () => {
    const exactlyStale = Date.now() - MODEL_CACHE_STALE_MS - 1;
    expect(isModelCacheStale(exactlyStale)).toBe(true);
  });
});

// ── formatCacheAge ────────────────────────────────────────────────────────────

describe("formatCacheAge", () => {
  test("returns null when fetchedAt is falsy", () => {
    expect(formatCacheAge(0)).toBeNull();
    expect(formatCacheAge(null)).toBeNull();
  });

  test("returns 'just now' for timestamps less than 1 minute ago", () => {
    expect(formatCacheAge(Date.now() - 30_000)).toBe("just now");
  });

  test("returns minutes for timestamps 1–59 minutes ago", () => {
    expect(formatCacheAge(Date.now() - 5 * 60_000)).toBe("5m ago");
    expect(formatCacheAge(Date.now() - 59 * 60_000)).toBe("59m ago");
  });

  test("returns hours for timestamps 1–23 hours ago", () => {
    expect(formatCacheAge(Date.now() - 3 * 3_600_000)).toBe("3h ago");
    expect(formatCacheAge(Date.now() - 23 * 3_600_000)).toBe("23h ago");
  });

  test("returns days for timestamps 24+ hours ago", () => {
    expect(formatCacheAge(Date.now() - 2 * 86_400_000)).toBe("2d ago");
    expect(formatCacheAge(Date.now() - 6 * 86_400_000)).toBe("6d ago");
  });
});

// ── costTier ──────────────────────────────────────────────────────────────────

describe("costTier", () => {
  test("haiku → $ (cheap)", () => {
    expect(costTier("claude-haiku-4-5")).toBe("$");
    expect(costTier("claude-haiku-3")).toBe("$");
  });

  test("gpt-4o-mini → $ (cheap)", () => {
    expect(costTier("gpt-4o-mini")).toBe("$");
  });

  test("gemini-2.0-flash → $ (cheap)", () => {
    expect(costTier("gemini-2.0-flash")).toBe("$");
  });

  test("gemini flash-lite variant → $ (cheap)", () => {
    expect(costTier("gemini-2.0-flash-lite")).toBe("$");
  });

  test("o3-mini → $$ (mid — caught by o[34]-mini cheap rule)", () => {
    expect(costTier("o3-mini")).toBe("$");
  });

  test("o4-mini → $ (cheap)", () => {
    expect(costTier("o4-mini")).toBe("$");
  });

  test("o1-mini → $$ (mid — NOT in cheap o[34]-mini set)", () => {
    expect(costTier("o1-mini")).toBe("$$");
  });

  test("claude-opus → $$$ (expensive)", () => {
    expect(costTier("claude-opus-4-7")).toBe("$$$");
    expect(costTier("claude-opus-3")).toBe("$$$");
  });

  test("o1 (non-mini) → $$$ (expensive)", () => {
    expect(costTier("o1")).toBe("$$$");
  });

  test("o3 (non-mini) → $$$ (expensive)", () => {
    expect(costTier("o3")).toBe("$$$");
  });

  test("o4 (non-mini) → $$$ (expensive)", () => {
    expect(costTier("o4")).toBe("$$$");
  });

  test("gpt-4o (full, non-mini) → $$ (mid)", () => {
    expect(costTier("gpt-4o")).toBe("$$");
  });

  test("gpt-4o-mini is not caught by gpt-4o mid rule (mini rule wins)", () => {
    expect(costTier("gpt-4o-mini")).toBe("$");
  });

  test("claude-sonnet → $$ (mid)", () => {
    expect(costTier("claude-sonnet-4-6")).toBe("$$");
  });

  test("case insensitive — CLAUDE-HAIKU → $", () => {
    expect(costTier("CLAUDE-HAIKU-4-5")).toBe("$");
  });

  test("unknown model → $$ (mid, safe default)", () => {
    expect(costTier("mystery-model-xyz")).toBe("$$");
  });
});
