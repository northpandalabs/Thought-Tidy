const crypto = require("crypto");
const {
  createOpenRouterPkce, buildOpenRouterAuthUrl, parseOpenRouterCallback, exchangeOpenRouterCode
} = require("../lib/openrouter-oauth");
const { callOpenRouter, callAI, callAIWithFallback } = require("../lib/api");
const { fetchOpenRouterModels } = require("../lib/models");

function mockOk(body) {
  return jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body });
}

function mockFail(status, errorMsg) {
  return jest.fn().mockResolvedValue({
    ok: false, status, statusText: `HTTP ${status}`,
    json: async () => ({ error: { message: errorMsg } })
  });
}

const B64URL = /^[A-Za-z0-9_-]+$/;

beforeEach(() => { global.fetch = jest.fn(); });
afterEach(() => { jest.clearAllMocks(); });

// ── PKCE ──────────────────────────────────────────────────────────────────────

describe("createOpenRouterPkce", () => {
  test("verifier, challenge and state are unpadded base64url", async () => {
    const { verifier, challenge, state } = await createOpenRouterPkce();
    expect(verifier).toMatch(B64URL);
    expect(challenge).toMatch(B64URL);
    expect(state).toMatch(B64URL);
    expect(verifier.length).toBe(43); // 32 bytes
  });

  test("challenge is base64url(SHA-256(verifier))", async () => {
    const { verifier, challenge } = await createOpenRouterPkce();
    expect(challenge).toBe(crypto.createHash("sha256").update(verifier).digest("base64url"));
  });

  test("each call produces a fresh verifier and state", async () => {
    const a = await createOpenRouterPkce();
    const b = await createOpenRouterPkce();
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.state).not.toBe(b.state);
  });
});

describe("buildOpenRouterAuthUrl", () => {
  test("includes callback, S256 challenge, state and key label", () => {
    const u = new URL(buildOpenRouterAuthUrl("https://abc.chromiumapp.org/openrouter", "CH", "ST"));
    expect(u.origin + u.pathname).toBe("https://openrouter.ai/auth");
    expect(u.searchParams.get("callback_url")).toBe("https://abc.chromiumapp.org/openrouter");
    expect(u.searchParams.get("code_challenge")).toBe("CH");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("state")).toBe("ST");
    expect(u.searchParams.get("key_label")).toBe("Thought Tidy");
  });

  test("never puts the verifier in the URL", async () => {
    const { verifier, challenge, state } = await createOpenRouterPkce();
    expect(buildOpenRouterAuthUrl("http://localhost:1/callback", challenge, state)).not.toContain(verifier);
  });
});

describe("parseOpenRouterCallback", () => {
  test("returns the code when state matches", () => {
    expect(parseOpenRouterCallback("https://x.chromiumapp.org/?code=abc&state=s1", "s1")).toBe("abc");
  });

  test("rejects a state mismatch", () => {
    expect(() => parseOpenRouterCallback("https://x/?code=abc&state=evil", "s1")).toThrow("state mismatch");
  });

  test("treats a missing code as cancellation", () => {
    expect(() => parseOpenRouterCallback("https://x/?state=s1", "s1")).toThrow("cancelled");
  });

  test("surfaces access_denied as cancellation", () => {
    expect(() => parseOpenRouterCallback("https://x/?error=access_denied", "s1")).toThrow("cancelled");
  });

  test("rejects a malformed redirect", () => {
    expect(() => parseOpenRouterCallback("not a url", "s1")).toThrow("invalid redirect");
  });
});

describe("exchangeOpenRouterCode", () => {
  test("POSTs code + verifier and returns the key", async () => {
    global.fetch = mockOk({ key: "sk-or-v1-abc" });
    await expect(exchangeOpenRouterCode("CODE", "VERIFIER")).resolves.toBe("sk-or-v1-abc");
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/auth/keys");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({ code: "CODE", code_verifier: "VERIFIER", code_challenge_method: "S256" });
  });

  test("throws the server error on 403", async () => {
    global.fetch = mockFail(403, "Invalid code or code_verifier");
    await expect(exchangeOpenRouterCode("C", "V")).rejects.toThrow("Invalid code or code_verifier");
  });

  test("throws when no key is returned", async () => {
    global.fetch = mockOk({});
    await expect(exchangeOpenRouterCode("C", "V")).rejects.toThrow("no key returned");
  });
});

// ── API calls ─────────────────────────────────────────────────────────────────

describe("callOpenRouter", () => {
  test("throws a sign-in hint when key is empty", async () => {
    await expect(callOpenRouter("", "anthropic/claude-haiku-4.5", "Fix:", "hi")).rejects.toThrow("OpenRouter not connected");
  });

  test("calls chat completions with Bearer key and org-prefixed model", async () => {
    global.fetch = mockOk({ choices: [{ message: { content: " Fixed " } }] });
    await expect(callOpenRouter("sk-or-1", "openai/gpt-4o-mini", "Fix:", "hi")).resolves.toBe("Fixed");
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(opts.headers.Authorization).toBe("Bearer sk-or-1");
    const body = JSON.parse(opts.body);
    expect(body.model).toBe("openai/gpt-4o-mini");
    expect(body.messages).toEqual([{ role: "system", content: "Fix:" }, { role: "user", content: "hi" }]);
  });

  test("prefixes errors with OpenRouter", async () => {
    global.fetch = mockFail(402, "Insufficient credits");
    await expect(callOpenRouter("sk-or-1", "openai/gpt-4o-mini", "Fix:", "hi")).rejects.toThrow("OpenRouter: Insufficient credits");
  });

  test("callAI routes the openrouter provider with its default model", async () => {
    global.fetch = mockOk({ choices: [{ message: { content: "ok" } }] });
    await callAI("openrouter", { openrouterKey: "sk-or-1" }, "Fix:", "hi");
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).model).toBe("anthropic/claude-haiku-4.5");
  });

  test("callAIWithFallback falls through to OpenRouter on a retriable error", async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, statusText: "HTTP 429", json: async () => ({ error: { message: "rate limit" } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: "done" } }] }) });
    const r = await callAIWithFallback(
      [{ id: "openai", apiKey: "sk-1", model: "gpt-4o-mini" }, { id: "openrouter", apiKey: "sk-or-1", model: "google/gemini-2.5-flash" }],
      null, {}, "Fix:", "hi"
    );
    expect(r).toEqual({ result: "done", usedProvider: "openrouter", usedModel: "google/gemini-2.5-flash" });
  });
});

describe("fetchOpenRouterModels", () => {
  test("validates the key, then keeps text-only OpenAI/Anthropic/Google models", async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { label: "Thought Tidy" } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [
        { id: "anthropic/claude-haiku-4.5", name: "Claude Haiku 4.5", created: 2, architecture: { output_modalities: ["text"] } },
        { id: "anthropic/claude-haiku-4.5:batch", name: "batch", created: 3, architecture: { output_modalities: ["text"] } },
        { id: "google/gemini-2.5-flash-image", name: "img", created: 4, architecture: { output_modalities: ["image", "text"] } },
        { id: "meta-llama/llama-4", name: "Llama", created: 5, architecture: { output_modalities: ["text"] } },
        { id: "openai/gpt-5", name: "GPT-5", created: 6, architecture: { output_modalities: ["text"] } }
      ] }) });
    const models = await fetchOpenRouterModels("sk-or-1");
    expect(global.fetch.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/key");
    expect(models).toEqual([
      { id: "openai/gpt-5", label: "GPT-5" },
      { id: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5" }
    ]);
  });

  test("throws on an invalid key without listing models", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({ ok: false, status: 401, statusText: "Unauthorized", json: async () => ({}) });
    await expect(fetchOpenRouterModels("bad")).rejects.toThrow("Invalid OpenRouter key.");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
