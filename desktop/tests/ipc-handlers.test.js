// Tests for the IPC handler logic in desktop/ipc-handlers.js.
// Uses plain JavaScript mock objects — no Electron required.

const {
  makeStoreGetHandler,
  makeStoreSetHandler,
  makeClipboardReadHandler,
  makeClipboardWriteHandler,
  registerAll
} = require("../ipc-handlers");

// ── Mock helpers ───────────────────────────────────────────────────────────────

function makeStore(initial = {}) {
  const data = { ...initial };
  return {
    get: (key)      => data[key],
    set: (key, val) => { data[key] = val; },
    store: data
  };
}

function makeClipboard(initial = "") {
  let text = initial;
  return {
    readText:  ()  => text,
    writeText: (t) => { text = t; }
  };
}

// The first arg to handlers is the ipcMain event object — we pass null in tests.
const EVENT = null;

// ── store-get ──────────────────────────────────────────────────────────────────

describe("makeStoreGetHandler", () => {
  let handler;
  beforeEach(() => {
    handler = makeStoreGetHandler(makeStore({ provider: "openai", openaiKey: "sk-abc" }));
  });

  test("returns a single value when called with a string key", () => {
    expect(handler(EVENT, "provider")).toBe("openai");
  });

  test("returns undefined for a missing key", () => {
    expect(handler(EVENT, "missing")).toBeUndefined();
  });

  test("returns an object with all requested keys when called with an array", () => {
    const result = handler(EVENT, ["provider", "openaiKey"]);
    expect(result).toEqual({ provider: "openai", openaiKey: "sk-abc" });
  });

  test("includes missing keys as undefined in array mode", () => {
    const result = handler(EVENT, ["provider", "claudeKey"]);
    expect(result.provider).toBe("openai");
    expect(result.claudeKey).toBeUndefined();
  });

  test("uses defaults from a defaults-object when key is missing", () => {
    const result = handler(EVENT, { provider: "gemini", variants: 2 });
    expect(result.provider).toBe("openai"); // stored value overrides default
    expect(result.variants).toBe(2);        // default used since key absent
  });

  test("stored value takes precedence over default in defaults-object mode", () => {
    const result = handler(EVENT, { openaiKey: "fallback" });
    expect(result.openaiKey).toBe("sk-abc");
  });
});

// ── store-set ──────────────────────────────────────────────────────────────────

describe("makeStoreSetHandler", () => {
  test("persists a single key-value pair", () => {
    const store   = makeStore();
    const handler = makeStoreSetHandler(store);
    handler(EVENT, { provider: "claude" });
    expect(store.get("provider")).toBe("claude");
  });

  test("persists multiple keys in one call", () => {
    const store   = makeStore();
    const handler = makeStoreSetHandler(store);
    handler(EVENT, { openaiKey: "sk-x", openaiModel: "gpt-4o" });
    expect(store.get("openaiKey")).toBe("sk-x");
    expect(store.get("openaiModel")).toBe("gpt-4o");
  });

  test("overwrites an existing value", () => {
    const store   = makeStore({ provider: "openai" });
    const handler = makeStoreSetHandler(store);
    handler(EVENT, { provider: "gemini" });
    expect(store.get("provider")).toBe("gemini");
  });

  test("handles an empty data object without throwing", () => {
    const store   = makeStore();
    const handler = makeStoreSetHandler(store);
    expect(() => handler(EVENT, {})).not.toThrow();
  });
});

// ── round-trip: get after set ──────────────────────────────────────────────────

describe("store get/set round-trip", () => {
  test("value written via set is immediately readable via get", () => {
    const store  = makeStore();
    const getter = makeStoreGetHandler(store);
    const setter = makeStoreSetHandler(store);

    setter(EVENT, { claudeKey: "sk-ant-test", claudeModel: "claude-sonnet" });

    const result = getter(EVENT, ["claudeKey", "claudeModel"]);
    expect(result).toEqual({ claudeKey: "sk-ant-test", claudeModel: "claude-sonnet" });
  });
});

// ── clipboard ──────────────────────────────────────────────────────────────────

describe("makeClipboardReadHandler", () => {
  test("returns current clipboard text", () => {
    const handler = makeClipboardReadHandler(makeClipboard("hello world"));
    expect(handler()).toBe("hello world");
  });

  test("returns empty string when clipboard is empty", () => {
    const handler = makeClipboardReadHandler(makeClipboard(""));
    expect(handler()).toBe("");
  });
});

describe("makeClipboardWriteHandler", () => {
  test("writes text to the clipboard", () => {
    const cb      = makeClipboard();
    const handler = makeClipboardWriteHandler(cb);
    handler(EVENT, "copied result");
    expect(cb.readText()).toBe("copied result");
  });

  test("overwrites previous clipboard content", () => {
    const cb      = makeClipboard("old content");
    const handler = makeClipboardWriteHandler(cb);
    handler(EVENT, "new content");
    expect(cb.readText()).toBe("new content");
  });
});

// ── registerAll ────────────────────────────────────────────────────────────────

describe("registerAll", () => {
  test("registers all 7 expected IPC channel names", () => {
    const registered = [];
    const fakeIpc = { handle: (name) => registered.push(name) };
    registerAll(fakeIpc, {
      store:        makeStore(),
      clipboard:    makeClipboard(),
      openSettings: jest.fn(),
      openHistory:  jest.fn(),
      closePopup:   jest.fn(),
      openURL:      jest.fn()
    });
    expect(registered).toEqual(expect.arrayContaining([
      "store-get", "store-set",
      "read-clipboard", "write-clipboard",
      "open-settings", "open-history", "close-popup", "open-url"
    ]));
    expect(registered).toHaveLength(8);
  });

  test("open-settings handler calls the provided callback", () => {
    const openSettings = jest.fn();
    const handlers     = {};
    const fakeIpc      = { handle: (name, fn) => { handlers[name] = fn; } };
    registerAll(fakeIpc, {
      store: makeStore(), clipboard: makeClipboard(),
      openSettings, closePopup: jest.fn(), openURL: jest.fn()
    });
    handlers["open-settings"]();
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  test("close-popup handler calls the provided callback", () => {
    const closePopup = jest.fn();
    const handlers   = {};
    const fakeIpc    = { handle: (name, fn) => { handlers[name] = fn; } };
    registerAll(fakeIpc, {
      store: makeStore(), clipboard: makeClipboard(),
      openSettings: jest.fn(), closePopup, openURL: jest.fn()
    });
    handlers["close-popup"]();
    expect(closePopup).toHaveBeenCalledTimes(1);
  });
});
