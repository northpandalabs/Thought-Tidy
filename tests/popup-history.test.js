// tests/popup-history.test.js
// Tests for the history sidebar in both the extension popup and the desktop popup.
//
// Structure:
//   1. Pure logic mirrors — history filtering, slicing, formatting
//   2. Source assertions  — verify both popup.js files read from the correct storage key
//                           and handle the pin-locked path correctly
//   3. Data-flow contract — verify background.js and runProcess both write to historyFull

const fs   = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

// ── Pure helpers (mirror logic from popup loadHistory functions) ──────────────

function filterTodayEntries(entries, today) {
  return (entries || []).filter(e => e.date === today);
}

function getDisplayEntries(entries) {
  // Matches: entries.slice(-10).reverse()
  return entries.slice(-10).reverse();
}

function formatActionName(action) {
  return action.replace(/-/g, " ");
}

function formatHistoryTime(timestamp) {
  const t = new Date(timestamp);
  return `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
}

function buildHistoryMeta(entry) {
  const time = formatHistoryTime(entry.timestamp);
  return `${time} · ${entry.source}`;
}

// ── filterTodayEntries ────────────────────────────────────────────────────────

describe("filterTodayEntries — only today's entries shown", () => {
  const TODAY = "2026-06-11";
  const YESTERDAY = "2026-06-10";

  test("keeps entries matching today's date", () => {
    const entries = [{ date: TODAY, action: "fix-spelling" }];
    expect(filterTodayEntries(entries, TODAY)).toHaveLength(1);
  });

  test("removes entries from yesterday", () => {
    const entries = [{ date: YESTERDAY, action: "fix-spelling" }];
    expect(filterTodayEntries(entries, TODAY)).toHaveLength(0);
  });

  test("filters mixed dates correctly", () => {
    const entries = [
      { date: TODAY, action: "fix-spelling" },
      { date: YESTERDAY, action: "shorten" },
      { date: TODAY, action: "expand" },
    ];
    const result = filterTodayEntries(entries, TODAY);
    expect(result).toHaveLength(2);
    expect(result.every(e => e.date === TODAY)).toBe(true);
  });

  test("returns empty array when no entries match today", () => {
    const entries = [{ date: YESTERDAY, action: "fix-spelling" }];
    expect(filterTodayEntries(entries, TODAY)).toHaveLength(0);
  });

  test("returns empty array for empty input", () => {
    expect(filterTodayEntries([], TODAY)).toHaveLength(0);
  });

  test("returns empty array for null input", () => {
    expect(filterTodayEntries(null, TODAY)).toHaveLength(0);
  });

  test("returns empty array for undefined input", () => {
    expect(filterTodayEntries(undefined, TODAY)).toHaveLength(0);
  });

  test("returns all entries when all match today", () => {
    const entries = Array.from({ length: 5 }, () => ({ date: TODAY, action: "fix-spelling" }));
    expect(filterTodayEntries(entries, TODAY)).toHaveLength(5);
  });
});

// ── getDisplayEntries ─────────────────────────────────────────────────────────

describe("getDisplayEntries — slice to 10 and reverse for newest-first", () => {
  const make = (n) => Array.from({ length: n }, (_, i) => ({ id: i, date: "2026-06-11" }));

  test("returns all entries when fewer than 10", () => {
    expect(getDisplayEntries(make(3))).toHaveLength(3);
  });

  test("caps at 10 entries", () => {
    expect(getDisplayEntries(make(15))).toHaveLength(10);
  });

  test("keeps the LAST 10 (most recent batch)", () => {
    const entries = make(15);
    const result  = getDisplayEntries(entries);
    const ids     = result.map(e => e.id);
    // slice(-10) gives indices 5..14, reversed gives 14..5
    expect(ids[0]).toBe(14);
    expect(ids[ids.length - 1]).toBe(5);
  });

  test("reverses so index 0 is the most recent", () => {
    const entries = [
      { id: 0, timestamp: 1000 },
      { id: 1, timestamp: 2000 },
      { id: 2, timestamp: 3000 },
    ];
    const result = getDisplayEntries(entries);
    expect(result[0].id).toBe(2);
    expect(result[result.length - 1].id).toBe(0);
  });

  test("handles exactly 10 entries without truncation", () => {
    expect(getDisplayEntries(make(10))).toHaveLength(10);
  });

  test("handles empty array", () => {
    expect(getDisplayEntries([])).toHaveLength(0);
  });

  test("single entry stays as single entry", () => {
    expect(getDisplayEntries([{ id: 0 }])).toHaveLength(1);
  });
});

// ── formatActionName ──────────────────────────────────────────────────────────

describe("formatActionName — hyphens to spaces for display", () => {
  test("fix-spelling → 'fix spelling'", () =>
    expect(formatActionName("fix-spelling")).toBe("fix spelling"));

  test("sound-like-me → 'sound like me'", () =>
    expect(formatActionName("sound-like-me")).toBe("sound like me"));

  test("expand → 'expand' (no hyphens, unchanged)", () =>
    expect(formatActionName("expand")).toBe("expand"));

  test("shorten → 'shorten'", () =>
    expect(formatActionName("shorten")).toBe("shorten"));

  test("custom-0 → 'custom 0'", () =>
    expect(formatActionName("custom-0")).toBe("custom 0"));

  test("custom-10 → 'custom 10'", () =>
    expect(formatActionName("custom-10")).toBe("custom 10"));

  test("multiple hyphens all replaced", () =>
    expect(formatActionName("a-b-c-d")).toBe("a b c d"));

  test("empty string unchanged", () =>
    expect(formatActionName("")).toBe(""));
});

// ── formatHistoryTime ─────────────────────────────────────────────────────────

describe("formatHistoryTime — HH:MM format", () => {
  test("single-digit hours and minutes are zero-padded", () => {
    // 01:05 in local time
    const d = new Date(2026, 0, 1, 1, 5, 0); // Jan 1, 01:05:00
    expect(formatHistoryTime(d.getTime())).toBe("01:05");
  });

  test("midnight is formatted as 00:00", () => {
    const d = new Date(2026, 0, 1, 0, 0, 0);
    expect(formatHistoryTime(d.getTime())).toBe("00:00");
  });

  test("noon is formatted as 12:00", () => {
    const d = new Date(2026, 0, 1, 12, 0, 0);
    expect(formatHistoryTime(d.getTime())).toBe("12:00");
  });

  test("23:59 formats correctly", () => {
    const d = new Date(2026, 0, 1, 23, 59, 0);
    expect(formatHistoryTime(d.getTime())).toBe("23:59");
  });

  test("output always has length 5 (HH:MM)", () => {
    const d = new Date(2026, 5, 11, 9, 3, 0);
    expect(formatHistoryTime(d.getTime())).toHaveLength(5);
  });

  test("output always contains a colon separator", () => {
    const d = new Date(2026, 5, 11, 14, 30, 0);
    expect(formatHistoryTime(d.getTime())).toContain(":");
  });
});

// ── buildHistoryMeta ──────────────────────────────────────────────────────────

describe("buildHistoryMeta — 'HH:MM · source' display string", () => {
  test("contains the source string", () => {
    const d = new Date(2026, 0, 1, 10, 0, 0);
    const entry = { timestamp: d.getTime(), source: "desktop" };
    expect(buildHistoryMeta(entry)).toContain("desktop");
  });

  test("contains the time string", () => {
    const d = new Date(2026, 0, 1, 10, 0, 0);
    const entry = { timestamp: d.getTime(), source: "desktop" };
    expect(buildHistoryMeta(entry)).toContain("10:00");
  });

  test("format is 'HH:MM · source'", () => {
    const d = new Date(2026, 0, 1, 8, 5, 0);
    const entry = { timestamp: d.getTime(), source: "extension" };
    expect(buildHistoryMeta(entry)).toBe("08:05 · extension");
  });
});

// ── popup/popup.js (extension) — storage source assertions ───────────────────

describe("popup/popup.js — loadHistory reads from historyFull", () => {
  let src;
  beforeAll(() => {
    src = fs.readFileSync(path.join(ROOT, "popup/popup.js"), "utf8");
  });

  test("loadHistory fetches 'historyFull' key from storage", () => {
    expect(src).toContain('"historyFull"');
  });

  test("loadHistory uses destructuring on historyFull", () => {
    expect(src).toContain("{ historyFull = [] }");
  });

  test("loadHistory does NOT fetch 'historyLog' for display", () => {
    const loadHistoryFn = src.slice(
      src.indexOf("async function loadHistory"),
      src.indexOf("async function runFromSelection")
    );
    expect(loadHistoryFn).not.toContain('"historyLog"');
  });

  test("loadHistory applies purgeOldLog to filter today's entries", () => {
    const fn = src.slice(
      src.indexOf("async function loadHistory"),
      src.indexOf("async function runFromSelection")
    );
    expect(fn).toContain("purgeOldLog");
  });

  test("loadHistory hides section when empty and not pin-locked", () => {
    const fn = src.slice(
      src.indexOf("async function loadHistory"),
      src.indexOf("async function runFromSelection")
    );
    expect(fn).toContain('section.style.display = "none"');
  });

  test("loadHistory shows section when entries exist", () => {
    const fn = src.slice(
      src.indexOf("async function loadHistory"),
      src.indexOf("async function runFromSelection")
    );
    expect(fn).toContain('section.style.display = "block"');
  });

  test("loadHistory caps display at 10 entries", () => {
    expect(src).toContain("slice(-10)");
  });

  test("loadHistory reverses entries for newest-first display", () => {
    expect(src).toContain(".reverse()");
  });

  test("loadHistory replaces hyphens in action names", () => {
    expect(src).toContain('replace(/-/g, " ")');
  });
});

describe("popup/popup.js — pin-locked history path (extension)", () => {
  let src;
  beforeAll(() => {
    src = fs.readFileSync(path.join(ROOT, "popup/popup.js"), "utf8");
  });

  test("shows lock icon when pin-locked", () => {
    expect(src).toContain("🔒 History locked");
  });

  test("pin-locked path opens history.html in a new browser tab", () => {
    expect(src).toContain("history/history.html");
    expect(src).toContain("browser.tabs.create");
  });

  test("pin-locked path closes the popup after opening tab", () => {
    expect(src).toContain("window.close()");
  });

  test("history count element is updated with entry count", () => {
    expect(src).toContain("history-count");
    expect(src).toContain(".textContent = entries.length");
  });
});

describe("popup/popup.js — init() historyLog maintenance", () => {
  let src;
  beforeAll(() => {
    src = fs.readFileSync(path.join(ROOT, "popup/popup.js"), "utf8");
  });

  test("init() still reads historyLog for purge/maintenance", () => {
    // background.js still writes to historyLog; init() cleans up old entries
    const initFn = src.slice(src.indexOf("async function init()"));
    expect(initFn).toContain("historyLog");
  });

  test("init() writes back purged historyLog when length changes", () => {
    const initFn = src.slice(src.indexOf("async function init()"));
    expect(initFn).toContain("purgeOldLog");
    expect(initFn).toContain('{ historyLog:');
  });
});

// ── desktop/renderer/popup.js — storage source assertions ────────────────────

describe("desktop/renderer/popup.js — loadHistory reads from historyFull", () => {
  let src;
  beforeAll(() => {
    src = fs.readFileSync(path.join(ROOT, "desktop/renderer/popup.js"), "utf8");
  });

  test("loadHistory fetches 'historyFull' key from storage", () => {
    expect(src).toContain('"historyFull"');
  });

  test("loadHistory uses destructuring on historyFull", () => {
    expect(src).toContain("{ historyFull = [] }");
  });

  test("loadHistory filters by todayDate()", () => {
    const fn = src.slice(
      src.indexOf("async function loadHistory"),
      src.indexOf("async function init")
    );
    expect(fn).toContain("todayDate()");
    expect(fn).toContain("e.date === today");
  });

  test("loadHistory does NOT use purgeOldLog (uses todayDate inline instead)", () => {
    const fn = src.slice(
      src.indexOf("async function loadHistory"),
      src.indexOf("async function init")
    );
    expect(fn).not.toContain("purgeOldLog");
  });

  test("loadHistory caps display at 10 entries", () => {
    expect(src).toContain("slice(-10)");
  });

  test("loadHistory reverses entries for newest-first display", () => {
    expect(src).toContain(".reverse()");
  });

  test("loadHistory replaces hyphens in action names", () => {
    expect(src).toContain('replace(/-/g, " ")');
  });

  test("loadHistory hides section when empty and not pin-locked", () => {
    const fn = src.slice(
      src.indexOf("async function loadHistory"),
      src.indexOf("async function init")
    );
    expect(fn).toContain('section.style.display = "none"');
  });
});

describe("desktop/renderer/popup.js — pin-locked history path (desktop)", () => {
  let src;
  beforeAll(() => {
    src = fs.readFileSync(path.join(ROOT, "desktop/renderer/popup.js"), "utf8");
  });

  test("shows lock icon when pin-locked", () => {
    expect(src).toContain("🔒 History locked");
  });

  test("pin-locked path calls btcAPI.openHistory() (not browser.tabs)", () => {
    expect(src).toContain("btcAPI.openHistory()");
  });

  test("desktop pin-locked does NOT call browser.tabs.create", () => {
    const fn = src.slice(
      src.indexOf("async function loadHistory"),
      src.indexOf("async function init")
    );
    expect(fn).not.toContain("browser.tabs.create");
  });
});

// ── Data-flow contract — who writes to historyFull ────────────────────────────

describe("historyFull write contract — all run paths write to historyFull", () => {
  test("shared-popup.js runProcess writes to historyFull", () => {
    const src = fs.readFileSync(path.join(ROOT, "lib/shared-popup.js"), "utf8");
    expect(src).toContain("historyFull");
    expect(src).toContain('appSet({ historyFull');
  });

  test("background.js writes to historyFull for context-menu runs", () => {
    const src = fs.readFileSync(path.join(ROOT, "background.js"), "utf8");
    expect(src).toContain("historyFull");
    expect(src).toContain('set({ historyFull');
  });

  test("background.js also writes to historyLog for legacy compatibility", () => {
    const src = fs.readFileSync(path.join(ROOT, "background.js"), "utf8");
    expect(src).toContain("historyLog");
    expect(src).toContain('set({ historyLog');
  });

  test("desktop/main.js quickAction writes to historyFull", () => {
    const src = fs.readFileSync(path.join(ROOT, "desktop/main.js"), "utf8");
    expect(src).toContain("historyFull");
    expect(src).toContain("historyFull.push(");
  });
});

describe("historyFull entry shape — consistent across write sites", () => {
  const REQUIRED_FIELDS = ["timestamp", "date", "source", "action", "provider", "model"];

  test("shared-popup.js historyFull push includes all required fields", () => {
    const src = fs.readFileSync(path.join(ROOT, "lib/shared-popup.js"), "utf8");
    REQUIRED_FIELDS.forEach(field => {
      expect(src).toContain(field);
    });
  });

  test("background.js historyFull push includes all required fields", () => {
    const src = fs.readFileSync(path.join(ROOT, "background.js"), "utf8");
    REQUIRED_FIELDS.forEach(field => {
      expect(src).toContain(field);
    });
  });

  test("desktop/main.js historyFull push includes all required fields", () => {
    const src = fs.readFileSync(path.join(ROOT, "desktop/main.js"), "utf8");
    REQUIRED_FIELDS.forEach(field => {
      expect(src).toContain(field);
    });
  });

  test("all write sites cap historyFull at 500 entries", () => {
    const sharedSrc  = fs.readFileSync(path.join(ROOT, "lib/shared-popup.js"), "utf8");
    const bgSrc      = fs.readFileSync(path.join(ROOT, "background.js"), "utf8");
    const desktopSrc = fs.readFileSync(path.join(ROOT, "desktop/main.js"), "utf8");
    expect(sharedSrc).toContain("slice(-500)");
    expect(bgSrc).toContain("slice(-500)");
    expect(desktopSrc).toContain("slice(-500)");
  });
});

// ── Storage key consistency — loadHistory reads what runProcess writes ─────────

describe("storage key consistency — extension popup reads the same key runProcess writes", () => {
  test("extension popup.js reads 'historyFull' — the key shared-popup runProcess writes", () => {
    const popupSrc  = fs.readFileSync(path.join(ROOT, "popup/popup.js"),       "utf8");
    const sharedSrc = fs.readFileSync(path.join(ROOT, "lib/shared-popup.js"),  "utf8");
    expect(popupSrc).toContain('"historyFull"');
    expect(sharedSrc).toContain('"historyFull"');
  });

  test("desktop popup.js reads 'historyFull' — the key desktop runProcess writes", () => {
    const desktopPopupSrc = fs.readFileSync(path.join(ROOT, "desktop/renderer/popup.js"), "utf8");
    const sharedSrc       = fs.readFileSync(path.join(ROOT, "lib/shared-popup.js"),       "utf8");
    expect(desktopPopupSrc).toContain('"historyFull"');
    expect(sharedSrc).toContain('"historyFull"');
  });

  test("neither popup reads ONLY from historyLog for display", () => {
    const extSrc     = fs.readFileSync(path.join(ROOT, "popup/popup.js"),              "utf8");
    const desktopSrc = fs.readFileSync(path.join(ROOT, "desktop/renderer/popup.js"),   "utf8");
    // Extract just the loadHistory function from each (before init())
    const extFn      = extSrc.slice(extSrc.indexOf("async function loadHistory"),     extSrc.indexOf("async function runFromSelection"));
    const desktopFn  = desktopSrc.slice(desktopSrc.indexOf("async function loadHistory"), desktopSrc.indexOf("async function init"));
    expect(extFn).not.toMatch(/storage\.local\.get\s*\(\s*["']historyLog["']/);
    expect(desktopFn).not.toMatch(/storage\.local\.get\s*\(\s*["']historyLog["']/);
  });
});

// ── shared-popup.js — historyLog write (all run paths) ───────────────────────

describe("shared-popup.js — historyLog written on every run path", () => {
  let src;
  beforeAll(() => {
    src = fs.readFileSync(path.join(ROOT, "lib/shared-popup.js"), "utf8");
  });

  test("runProcess saves both historyFull and historyLog in one appSet call", () => {
    const saveBlock = src.slice(src.lastIndexOf("historyFull.push("), src.lastIndexOf("historyFull.push(") + 1000);
    expect(saveBlock).toContain("historyLog.push(");
    expect(saveBlock).toContain("historyLog.slice(-200)");
  });

  test("clarify path saves both historyFull and historyLog in one appSet call", () => {
    const clarifyBlock = src.slice(src.indexOf("clarifyRounds:"), src.indexOf("clarifyRounds:") + 700);
    expect(clarifyBlock).toContain("historyLog.push(");
    expect(clarifyBlock).toContain("historyLog.slice(-200)");
  });

  test("runProcess historyLog entry records inputLen and outputLen", () => {
    expect(src).toContain("inputLen: text.length");
    expect(src).toContain("outputLen: results.reduce(");
  });

  test("runProcess historyLog entry records inputLen and outputLen for clarify path", () => {
    expect(src).toContain("inputLen: inputSnap.length");
    expect(src).toContain("outputLen: r.result.length");
  });

  test("runProcess fetches historyLog from storage before writing", () => {
    expect(src).toContain('"historyLog"');
    expect(src).toContain("stored.historyLog");
  });

  test("runProcess purges stale historyLog entries before appending", () => {
    expect(src).toContain("purgeOldLog(stored.historyLog");
  });
});

// ── shared-popup.js — multi-output recording ─────────────────────────────────

describe("shared-popup.js — multiple AI results all stored in historyFull.outputs", () => {
  let src;
  beforeAll(() => {
    src = fs.readFileSync(path.join(ROOT, "lib/shared-popup.js"), "utf8");
  });

  test("outputs field uses results.map — captures every variant", () => {
    expect(src).toContain("outputs: results.map(r => r.slice(0, 5000))");
  });

  test("outputLen in historyLog sums all variant lengths", () => {
    expect(src).toContain("results.reduce((s, r) => s + r.length, 0)");
  });

  test("clarify path wraps single result in array for outputs", () => {
    const clarifyPushBlock = src.slice(
      src.indexOf("clarifyRounds:") - 200,
      src.indexOf("clarifyRounds:") + 50
    );
    expect(clarifyPushBlock).toContain("outputs: [r.result.slice(0, 5000)]");
  });
});
