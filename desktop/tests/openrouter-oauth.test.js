const http = require("http");
const { signInWithOpenRouter, CALLBACK_PATH } = require("../lib-node/openrouter-oauth");

function get(url) {
  return new Promise((resolve, reject) => {
    // Hit IPv4 directly so the test does not depend on how "localhost" resolves
    const u = new URL(url);
    http.get({ host: "127.0.0.1", port: u.port, path: u.pathname + u.search }, res => {
      res.resume(); res.on("end", () => resolve(res.statusCode));
    }).on("error", reject);
  });
}

// Simulates the browser: reads the auth URL and redirects to the callback.
function fakeBrowser(buildRedirect) {
  return (authUrl) => {
    const u = new URL(authUrl);
    setImmediate(() => get(buildRedirect(u.searchParams.get("callback_url"), u.searchParams.get("state"))).catch(() => {}));
  };
}

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });

describe("signInWithOpenRouter (desktop loopback)", () => {
  test("opens the consent page with a localhost callback, then exchanges the code", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ key: "sk-or-v1-desktop" }) });
    let seenCallback;
    const key = await signInWithOpenRouter({
      openExternal: fakeBrowser((cb, state) => { seenCallback = cb; return `${cb}?code=THECODE&state=${state}`; })
    });
    expect(key).toBe("sk-or-v1-desktop");
    expect(seenCallback).toMatch(new RegExp(`^http://localhost:\\d+${CALLBACK_PATH}$`));
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.code).toBe("THECODE");
    expect(body.code_verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  test("rejects a callback with the wrong state and never exchanges", async () => {
    global.fetch = jest.fn();
    await expect(signInWithOpenRouter({
      openExternal: fakeBrowser(cb => `${cb}?code=X&state=forged`)
    })).rejects.toThrow("state mismatch");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("times out when the user never completes sign-in", async () => {
    await expect(signInWithOpenRouter({ openExternal: () => {}, timeoutMs: 50 })).rejects.toThrow("timed out");
  });

  test("concurrent calls share one in-flight sign-in", async () => {
    const opened = jest.fn();
    const a = signInWithOpenRouter({ openExternal: opened, timeoutMs: 50 });
    const b = signInWithOpenRouter({ openExternal: opened, timeoutMs: 50 });
    expect(a).toBe(b);
    await expect(a).rejects.toThrow("timed out");
    expect(opened).toHaveBeenCalledTimes(1);
  });
});
