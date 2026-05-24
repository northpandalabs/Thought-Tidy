// Tests for lib/crypto-storage.js
// Uses the real Web Crypto API (available in Node 20 via globalThis.crypto)
// and mocks browser.storage.local + fetch.

// ── browser global mock ───────────────────────────────────────────────────────

function makeBrowserMock(initial = {}) {
  const store = { ...initial };
  return {
    storage: {
      local: {
        async get(keys) {
          if (typeof keys === "string") {
            return store[keys] !== undefined ? { [keys]: store[keys] } : {};
          }
          const arr = Array.isArray(keys) ? keys : Object.keys(keys);
          const result = {};
          for (const k of arr) {
            if (store[k] !== undefined) result[k] = store[k];
          }
          return result;
        },
        async set(data) { Object.assign(store, data); }
      }
    },
    _store: store
  };
}

// ── helpers ───────────────────────────────────────────────────────────────────

function loadFreshModule(initial = {}) {
  jest.resetModules();
  global.browser = makeBrowserMock(initial);
  return require("../lib/crypto-storage");
}

// ── exports ───────────────────────────────────────────────────────────────────

describe("module exports", () => {
  test("exports cryptoGet, cryptoSet, migrateExtensionKeys, syncWithDesktop", () => {
    const mod = loadFreshModule();
    expect(typeof mod.cryptoGet).toBe("function");
    expect(typeof mod.cryptoSet).toBe("function");
    expect(typeof mod.migrateExtensionKeys).toBe("function");
    expect(typeof mod.syncWithDesktop).toBe("function");
  });
});

// ── encrypt / decrypt roundtrip ───────────────────────────────────────────────

describe("cryptoGet / cryptoSet — sensitive field encryption", () => {
  let cryptoGet, cryptoSet;

  beforeAll(() => {
    ({ cryptoGet, cryptoSet } = loadFreshModule());
  });

  test("stored API key is encrypted (ck1: prefix)", async () => {
    await cryptoSet({ openaiKey: "sk-test-key" });
    const raw = global.browser._store.openaiKey;
    expect(raw).toMatch(/^ck1:/);
  });

  test("cryptoGet decrypts the key back to plaintext", async () => {
    await cryptoSet({ openaiKey: "sk-roundtrip" });
    const result = await cryptoGet(["openaiKey"]);
    expect(result.openaiKey).toBe("sk-roundtrip");
  });

  test("non-sensitive fields are stored and returned as-is", async () => {
    await cryptoSet({ openaiModel: "gpt-4o-mini" });
    const result = await cryptoGet(["openaiModel"]);
    expect(result.openaiModel).toBe("gpt-4o-mini");
  });

  test("syncMeta is stamped after setting a SYNC_KEY", async () => {
    await cryptoSet({ openaiModel: "gpt-4o" });
    const meta = global.browser._store.syncMeta;
    expect(meta).toBeDefined();
    expect(typeof meta.lastChanged).toBe("string");
  });

  test("syncMeta is NOT stamped for non-SYNC_KEY fields", async () => {
    global.browser._store.syncMeta = undefined;
    await cryptoSet({ _extMig: true });
    expect(global.browser._store.syncMeta).toBeUndefined();
  });
});

// ── configuredProviders encryption ───────────────────────────────────────────

describe("configuredProviders apiKey encryption", () => {
  let cryptoGet, cryptoSet;

  beforeAll(() => {
    ({ cryptoGet, cryptoSet } = loadFreshModule());
  });

  test("configuredProviders apiKey is encrypted on set", async () => {
    await cryptoSet({
      configuredProviders: [
        { provider: "openai", apiKey: "sk-plain", model: "gpt-4o-mini" }
      ]
    });
    const stored = global.browser._store.configuredProviders;
    expect(stored[0].apiKey).toMatch(/^ck1:/);
  });

  test("configuredProviders apiKey is decrypted on get", async () => {
    await cryptoSet({
      configuredProviders: [
        { provider: "openai", apiKey: "sk-decrypt-me", model: "gpt-4o-mini" }
      ]
    });
    const result = await cryptoGet(["configuredProviders"]);
    expect(result.configuredProviders[0].apiKey).toBe("sk-decrypt-me");
  });

  test("providers with no apiKey are left untouched", async () => {
    await cryptoSet({
      configuredProviders: [
        { provider: "openai", apiKey: null, model: "gpt-4o-mini" }
      ]
    });
    const result = await cryptoGet(["configuredProviders"]);
    expect(result.configuredProviders[0].apiKey).toBeNull();
  });
});

// ── key import from existing storage ─────────────────────────────────────────

describe("_getKey — import from existing storage", () => {
  test("encrypts correctly when a previously-generated key exists in storage", async () => {
    // First pass: generate a key and encrypt something
    const { cryptoSet: set1, cryptoGet: get1 } = loadFreshModule();
    await set1({ openaiKey: "sk-first" });
    const savedKey = global.browser._store._extCk;
    expect(typeof savedKey).toBe("string");

    // Second pass: fresh module load with the same _extCk already in storage
    const { cryptoGet: get2, cryptoSet: set2 } = loadFreshModule({ _extCk: savedKey });
    await set2({ openaiKey: "sk-second" });
    const result = await get2(["openaiKey"]);
    expect(result.openaiKey).toBe("sk-second");
  });
});

// ── _dec — corrupted value passthrough ───────────────────────────────────────

describe("_dec — corrupted ciphertext passthrough", () => {
  test("cryptoGet returns the raw value when decryption fails", async () => {
    const { cryptoGet } = loadFreshModule({ claudeKey: "ck1:not-valid-base64!!!" });
    const result = await cryptoGet(["claudeKey"]);
    // Should return the raw string rather than throwing
    expect(result.claudeKey).toBe("ck1:not-valid-base64!!!");
  });
});

// ── migrateExtensionKeys ──────────────────────────────────────────────────────

describe("migrateExtensionKeys", () => {
  test("encrypts plaintext keys and sets _extMig flag", async () => {
    const { migrateExtensionKeys } = loadFreshModule({
      openaiKey: "sk-plaintext-key",
      claudeKey: "sk-ant-plaintext"
    });
    await migrateExtensionKeys();
    expect(global.browser._store.openaiKey).toMatch(/^ck1:/);
    expect(global.browser._store.claudeKey).toMatch(/^ck1:/);
    expect(global.browser._store._extMig).toBe(true);
  });

  test("is idempotent — skips migration if _extMig is already set", async () => {
    const { migrateExtensionKeys } = loadFreshModule({
      openaiKey: "sk-plaintext",
      _extMig: true
    });
    await migrateExtensionKeys();
    // Key should remain plaintext — migration was skipped
    expect(global.browser._store.openaiKey).toBe("sk-plaintext");
  });

  test("skips already-encrypted keys (ck1: prefix)", async () => {
    // Pre-generate an encrypted key
    const { cryptoSet, migrateExtensionKeys } = loadFreshModule();
    await cryptoSet({ geminiKey: "sk-gem" });
    const encryptedKey = global.browser._store.geminiKey;
    expect(encryptedKey).toMatch(/^ck1:/);

    // Reset _extMig to force a re-run of migration
    global.browser._store._extMig = undefined;
    await migrateExtensionKeys();
    // Key should remain the same encrypted value
    expect(global.browser._store.geminiKey).toBe(encryptedKey);
  });

  test("migrates configuredProviders with plaintext apiKeys", async () => {
    const { migrateExtensionKeys } = loadFreshModule({
      configuredProviders: [
        { provider: "openai", apiKey: "sk-provider-plain" }
      ]
    });
    await migrateExtensionKeys();
    expect(global.browser._store.configuredProviders[0].apiKey).toMatch(/^ck1:/);
  });
});

// ── syncWithDesktop ───────────────────────────────────────────────────────────

describe("syncWithDesktop", () => {
  const DESKTOP_TOKEN = "abc123";
  const EXT_META   = { lastChanged: "2026-05-24T10:00:00.000Z" };
  const OLD_META   = { lastChanged: "2026-05-24T09:00:00.000Z" };
  const NEW_META   = { lastChanged: "2026-05-24T11:00:00.000Z" };

  beforeEach(() => { jest.clearAllMocks(); });
  afterEach(() => { delete global.fetch; });

  test("silent no-op when desktop ping fails", async () => {
    const { syncWithDesktop } = loadFreshModule();
    global.fetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(syncWithDesktop()).resolves.toBeUndefined();
  });

  test("silent no-op when ping returns non-ok", async () => {
    const { syncWithDesktop } = loadFreshModule();
    global.fetch = jest.fn().mockResolvedValue({ ok: false });
    await expect(syncWithDesktop()).resolves.toBeUndefined();
  });

  test("no-op when timestamps are equal", async () => {
    const { syncWithDesktop } = loadFreshModule({ syncMeta: EXT_META });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: DESKTOP_TOKEN, syncMeta: EXT_META })
    });
    await syncWithDesktop();
    // Only /ping was called, no /settings call
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("push path: extension newer → POST /settings", async () => {
    const { syncWithDesktop } = loadFreshModule({ syncMeta: NEW_META });
    const newSyncMeta = { lastChanged: "2026-05-24T11:05:00.000Z" };
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: DESKTOP_TOKEN, syncMeta: OLD_META })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ syncMeta: newSyncMeta })
      });
    await syncWithDesktop();
    const [, postCall] = global.fetch.mock.calls;
    expect(postCall[0]).toContain("/settings");
    expect(postCall[1].method).toBe("POST");
    expect(global.browser._store.syncMeta).toEqual(newSyncMeta);
  });

  test("pull path: desktop newer → GET /settings and re-encrypts", async () => {
    const { syncWithDesktop } = loadFreshModule({ syncMeta: OLD_META });
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: DESKTOP_TOKEN, syncMeta: NEW_META })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ settings: { openaiKey: "sk-from-desktop", openaiModel: "gpt-4o" } })
      });
    await syncWithDesktop();
    // openaiKey should now be encrypted in extension storage
    expect(global.browser._store.openaiKey).toMatch(/^ck1:/);
    // syncMeta should match the desktop's exactly
    expect(global.browser._store.syncMeta).toEqual(NEW_META);
  });

  test("pull path: silent no-op when /settings GET fails", async () => {
    const { syncWithDesktop } = loadFreshModule({ syncMeta: OLD_META });
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: DESKTOP_TOKEN, syncMeta: NEW_META })
      })
      .mockResolvedValueOnce({ ok: false });
    await expect(syncWithDesktop()).resolves.toBeUndefined();
  });
});
