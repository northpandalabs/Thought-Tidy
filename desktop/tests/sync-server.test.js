// Tests for desktop/lib-node/sync-server.js
// Uses port 0 so the OS assigns a free port — no conflict with a running desktop app.

const http = require("http");
const { startSyncServer } = require("../lib-node/sync-server");

// ── helpers ────────────────────────────────────────────────────────────────────

let TEST_PORT = 0; // set after server starts

function request({ method = "GET", path = "/ping", token = null, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: "127.0.0.1",
      port: TEST_PORT,
      path,
      method,
      headers: {}
    };
    if (token) opts.headers["X-Btc-Token"] = token;
    if (body !== null) {
      const payload = typeof body === "string" ? body : JSON.stringify(body);
      opts.headers["Content-Type"]   = "application/json";
      opts.headers["Content-Length"] = Buffer.byteLength(payload);
    }
    const req = http.request(opts, res => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on("error", reject);
    if (body !== null) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
  });
}

// ── test suite ─────────────────────────────────────────────────────────────────

describe("sync-server", () => {
  let server;
  let sessionToken;
  let mockStore;

  beforeAll(async () => {
    mockStore = {
      _data: {
        openaiKey:   "sk-plaintext",
        claudeKey:   undefined,       // undefined → should be omitted in GET /settings
        geminiModel: "gemini-2.0-flash",
        syncMeta:    { lastChanged: "2026-05-24T00:00:00.000Z" }
      },
      get(key)      { return this._data[key]; },
      set(key, val) { this._data[key] = val; }
    };

    server = startSyncServer(mockStore, 0); // 0 = OS-assigned free port

    await new Promise((resolve, reject) => {
      if (server.listening) { TEST_PORT = server.address().port; resolve(); return; }
      server.once("listening", () => { TEST_PORT = server.address().port; resolve(); });
      server.once("error",     reject);
    });

    const ping = await request({ path: "/ping" });
    sessionToken = JSON.parse(ping.body).token;
  });

  afterAll(() => new Promise(resolve => server.close(resolve)));

  // ── exports ───────────────────────────────────────────────────────────────────

  test("exports startSyncServer as a function", () => {
    expect(typeof startSyncServer).toBe("function");
  });

  // ── OPTIONS preflight ─────────────────────────────────────────────────────────

  test("OPTIONS / returns 204 with CORS headers", async () => {
    const res = await request({ method: "OPTIONS", path: "/" });
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["access-control-allow-methods"]).toContain("POST");
  });

  // ── GET /ping ─────────────────────────────────────────────────────────────────

  test("GET /ping returns 200 with token and syncMeta — no auth needed", async () => {
    const res = await request({ path: "/ping" });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(typeof json.token).toBe("string");
    expect(json.token.length).toBe(32); // 16 random bytes → 32 hex chars
    expect(json.syncMeta).toEqual({ lastChanged: "2026-05-24T00:00:00.000Z" });
  });

  test("GET /ping with no syncMeta in store returns syncMeta: null", async () => {
    const original = mockStore._data.syncMeta;
    mockStore._data.syncMeta = undefined;
    const res  = await request({ path: "/ping" });
    const json = JSON.parse(res.body);
    expect(json.syncMeta).toBeNull();
    mockStore._data.syncMeta = original;
  });

  // ── token gating ──────────────────────────────────────────────────────────────

  test("GET /settings without token returns 401", async () => {
    const res = await request({ path: "/settings" });
    expect(res.status).toBe(401);
  });

  test("GET /settings with wrong token returns 401", async () => {
    const res = await request({ path: "/settings", token: "wrong-token" });
    expect(res.status).toBe(401);
  });

  test("POST /settings without token returns 401", async () => {
    const res = await request({ method: "POST", path: "/settings", body: { settings: {} } });
    expect(res.status).toBe(401);
  });

  // ── GET /settings ─────────────────────────────────────────────────────────────

  test("GET /settings returns only defined SYNC_KEY values", async () => {
    const res  = await request({ path: "/settings", token: sessionToken });
    expect(res.status).toBe(200);
    const { settings } = JSON.parse(res.body);
    expect(settings.openaiKey).toBe("sk-plaintext");
    expect(settings.geminiModel).toBe("gemini-2.0-flash");
    // claudeKey is undefined in store — should be omitted
    expect("claudeKey" in settings).toBe(false);
  });

  // ── POST /settings ────────────────────────────────────────────────────────────

  test("POST /settings stores SYNC_KEY values and returns syncMeta", async () => {
    const res = await request({
      method: "POST",
      path:   "/settings",
      token:  sessionToken,
      body:   { settings: { openaiKey: "sk-new", unknownKey: "ignored" } }
    });
    expect(res.status).toBe(200);
    const { syncMeta } = JSON.parse(res.body);
    expect(typeof syncMeta.lastChanged).toBe("string");
    expect(mockStore._data.openaiKey).toBe("sk-new");
    // Non-SYNC_KEY "unknownKey" should not have been stored
    expect(mockStore._data.unknownKey).toBeUndefined();
  });

  test("POST /settings with invalid JSON returns 400", async () => {
    const res = await request({
      method: "POST",
      path:   "/settings",
      token:  sessionToken,
      body:   "not-valid-json{{"
    });
    expect(res.status).toBe(400);
  });

  // ── unknown routes ────────────────────────────────────────────────────────────

  test("GET /unknown returns 404", async () => {
    const res = await request({ path: "/unknown", token: sessionToken });
    expect(res.status).toBe(404);
  });

  test("POST /unknown returns 404", async () => {
    const res = await request({ method: "POST", path: "/unknown", token: sessionToken, body: {} });
    expect(res.status).toBe(404);
  });
});
