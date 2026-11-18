// "Sign in with OpenRouter" for the desktop app.
// Opens the consent page in the system browser and catches the redirect on a one-shot
// loopback server (OpenRouter allows http://localhost callbacks on any port).
const http = require("http");
const {
  createOpenRouterPkce, buildOpenRouterAuthUrl, parseOpenRouterCallback, exchangeOpenRouterCode
} = require("../../lib/openrouter-oauth.js");

const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;
const CALLBACK_PATH      = "/callback";

const _DONE_PAGE = (ok) => `<!doctype html><meta charset="utf-8"><title>Thought Tidy</title>
<body style="font-family:system-ui,sans-serif;background:#1e1e2e;color:#cdd6f4;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center"><h2>${ok ? "Signed in to OpenRouter" : "Sign-in did not complete"}</h2>
<p>You can close this tab and return to Thought Tidy.</p></div></body>`;

let _inFlight = null;

// Resolves with an OpenRouter API key. Only one sign-in runs at a time; a second call
// while one is pending returns the same promise.
function signInWithOpenRouter({ openExternal, timeoutMs = SIGN_IN_TIMEOUT_MS } = {}) {
  if (_inFlight) return _inFlight;
  _inFlight = _run(openExternal, timeoutMs).finally(() => { _inFlight = null; });
  return _inFlight;
}

async function _run(openExternal, timeoutMs) {
  const { verifier, challenge, state } = await createOpenRouterPkce();
  const servers = [];
  let timer;

  try {
    const code = await new Promise((resolve, reject) => {
      const onRequest = (req, res) => {
        const url = new URL(req.url, "http://localhost");
        if (url.pathname !== CALLBACK_PATH) { res.writeHead(404).end(); return; }
        let result;
        try {
          result = parseOpenRouterCallback(url.toString(), state);
        } catch (err) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" }).end(_DONE_PAGE(false));
          reject(err);
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(_DONE_PAGE(true));
        resolve(result);
      };

      // Listen on IPv4 first to get a free port, then try the same port on IPv6 so the
      // callback lands whichever address the browser resolves "localhost" to.
      const v4 = http.createServer(onRequest);
      servers.push(v4);
      v4.once("error", reject);
      v4.listen(0, "127.0.0.1", () => {
        const port = v4.address().port;
        const v6 = http.createServer(onRequest);
        v6.once("error", () => {}); // IPv6 unavailable or port taken — IPv4 alone is fine
        v6.listen(port, "::1", () => servers.push(v6));

        const callbackUrl = `http://localhost:${port}${CALLBACK_PATH}`;
        Promise.resolve(openExternal(buildOpenRouterAuthUrl(callbackUrl, challenge, state))).catch(reject);
      });

      timer = setTimeout(() => reject(new Error("OpenRouter sign-in timed out. Try again.")), timeoutMs);
    });

    return await exchangeOpenRouterCode(code, verifier);
  } finally {
    clearTimeout(timer);
    servers.forEach(s => { try { s.close(); s.closeAllConnections?.(); } catch {} });
  }
}

module.exports = { signInWithOpenRouter, CALLBACK_PATH };
