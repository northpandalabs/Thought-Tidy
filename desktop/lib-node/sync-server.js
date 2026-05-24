// sync-server.js — local HTTP server for extension↔desktop settings sync
// Binds to 127.0.0.1:47391 only (loopback — not reachable from other machines).
// Session token is random on each launch so there is no persistent shared secret to steal.

const http   = require("http");
const crypto = require("crypto");

const PORT          = 47391;
const SESSION_TOKEN = crypto.randomBytes(16).toString("hex");

const SYNC_KEYS = new Set([
  "configuredProviders", "geminiModels",
  "openaiKey", "claudeKey", "geminiKey",
  "openaiModel", "claudeModel", "geminiModel",
  "variants", "customPrompts", "actionSettings",
  "profileName", "profileRole", "profileStyle", "profileContext", "profileEnabled"
]);

// Type validators for each sync key — rejects values with wrong shape from POST /settings
const SYNC_VALIDATORS = {
  configuredProviders: v => Array.isArray(v),
  geminiModels:        v => Array.isArray(v),
  openaiKey:           v => typeof v === "string",
  claudeKey:           v => typeof v === "string",
  geminiKey:           v => typeof v === "string",
  openaiModel:         v => typeof v === "string",
  claudeModel:         v => typeof v === "string",
  geminiModel:         v => typeof v === "string",
  variants:            v => typeof v === "number" && Number.isFinite(v),
  customPrompts:       v => Array.isArray(v),
  actionSettings:      v => Array.isArray(v),
  profileName:         v => typeof v === "string",
  profileRole:         v => typeof v === "string",
  profileStyle:        v => typeof v === "string",
  profileContext:      v => typeof v === "string",
  profileEnabled:      v => typeof v === "boolean",
};

// encStore must implement: .get(key) → decrypted value, .set(key, val) → encrypts sensitive values
// port defaults to PORT (47391); pass 0 in tests to get an OS-assigned free port
function startSyncServer(encStore, port = PORT) {
  const server = http.createServer((req, res) => {
    // Reflect extension origins; anything else gets 127.0.0.1 (won't match web page origins)
    const origin = req.headers["origin"] || "";
    const allowedOrigin = /^(chrome-extension|moz-extension):\/\//.test(origin)
      ? origin
      : "http://127.0.0.1";
    res.setHeader("Access-Control-Allow-Origin",  allowedOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Btc-Token");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // /ping — public, no token needed; returns session token + syncMeta for timestamp comparison
    if (req.url === "/ping" && req.method === "GET") {
      const syncMeta = encStore.get("syncMeta") || null;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ token: SESSION_TOKEN, syncMeta }));
      return;
    }

    // All other routes require the session token
    if (req.headers["x-btc-token"] !== SESSION_TOKEN) {
      res.writeHead(401);
      res.end("Unauthorized");
      return;
    }

    // GET /settings — returns all sync-relevant settings (decrypted by encStore.get)
    if (req.url === "/settings" && req.method === "GET") {
      const settings = {};
      for (const k of SYNC_KEYS) {
        const v = encStore.get(k);
        if (v !== undefined) settings[k] = v;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ settings }));
      return;
    }

    // POST /settings — receives plaintext settings from extension, stores encrypted via encStore.set
    if (req.url === "/settings" && req.method === "POST") {
      let body = "";
      req.on("data", chunk => {
        body += chunk;
        if (body.length > 1_000_000) req.destroy();
      });
      req.on("end", () => {
        try {
          const { settings } = JSON.parse(body);
          for (const [k, v] of Object.entries(settings)) {
            const valid = SYNC_VALIDATORS[k];
            if (SYNC_KEYS.has(k) && v !== undefined && valid && valid(v)) encStore.set(k, v);
          }
          // Stamp the canonical sync time and return it so both sides agree
          const newMeta = { lastChanged: new Date().toISOString() };
          encStore.set("syncMeta", newMeta);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ syncMeta: newMeta }));
        } catch {
          res.writeHead(400);
          res.end("Bad Request");
        }
      });
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  });

  server.listen(port, "127.0.0.1", () => {});
  server.on("error", () => {}); // Silently ignore port conflicts (another instance running)
  return server;
}

module.exports = { startSyncServer };
