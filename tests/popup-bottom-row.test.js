// tests/popup-bottom-row.test.js
// Tests for the popup bottom row (History + Settings), textarea draft
// persistence, and the result-expand-btn CSS.
//
// Structure:
//   1. Pure logic mirrors  — draft-restore predicate
//   2. Source assertions   — popup.js wires up draft save/restore and history button
//   3. HTML structure      — popup.html contains both bottom-row buttons
//   4. CSS assertions      — .bottom-row, #open-settings flex ratio, #result-expand-btn

const fs   = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

// ── Pure logic: draft restore predicate ──────────────────────────────────────

function shouldRestoreDraft(draft) {
  return typeof draft === "string" && draft.length > 0;
}

describe("shouldRestoreDraft — textarea draft restore predicate", () => {
  test("restores non-empty string draft", () => {
    expect(shouldRestoreDraft("hello world")).toBe(true);
  });

  test("restores single-character draft", () => {
    expect(shouldRestoreDraft("x")).toBe(true);
  });

  test("does not restore empty string", () => {
    expect(shouldRestoreDraft("")).toBe(false);
  });

  test("does not restore undefined", () => {
    expect(shouldRestoreDraft(undefined)).toBe(false);
  });

  test("does not restore null", () => {
    expect(shouldRestoreDraft(null)).toBe(false);
  });

  test("does not restore a number", () => {
    expect(shouldRestoreDraft(42)).toBe(false);
  });

  test("restores multiline draft", () => {
    expect(shouldRestoreDraft("line1\nline2")).toBe(true);
  });
});

// ── popup/popup.js — textarea draft persistence ───────────────────────────────

describe("popup/popup.js — inputTextDraft storage key", () => {
  let src;
  beforeAll(() => {
    src = fs.readFileSync(path.join(ROOT, "popup/popup.js"), "utf8");
  });

  test("'inputTextDraft' is in the STORAGE_KEYS list", () => {
    const keysBlock = src.slice(
      src.indexOf("STORAGE_KEYS"),
      src.indexOf("STORAGE_KEYS") + 600
    );
    expect(keysBlock).toContain("inputTextDraft");
  });

  test("draft is restored on init when storage value exists", () => {
    const initFn = src.slice(src.indexOf("async function init()"));
    expect(initFn).toContain("inputTextDraft");
    expect(initFn).toContain("ta.value");
  });

  test("draft save is debounced with clearTimeout + setTimeout", () => {
    expect(src).toContain("clearTimeout(_draftTimer)");
    expect(src).toContain("setTimeout(");
  });

  test("draft save writes to storage using 'inputTextDraft' key", () => {
    expect(src).toContain("{ inputTextDraft:");
  });

  test("draft save captures ta.value", () => {
    expect(src).toContain("inputTextDraft: ta.value");
  });

  test("restoring the draft dispatches an input event (triggers height recalc)", () => {
    const initFn = src.slice(src.indexOf("async function init()"));
    const draftBlock = initFn.slice(
      initFn.indexOf("inputTextDraft"),
      initFn.indexOf("inputTextDraft") + 200
    );
    expect(draftBlock).toContain('new Event("input")');
  });
});

// ── popup/popup.js — History button click handler ────────────────────────────

describe("popup/popup.js — History button wiring", () => {
  let src;
  beforeAll(() => {
    src = fs.readFileSync(path.join(ROOT, "popup/popup.js"), "utf8");
  });

  test("open-history-btn click handler is registered", () => {
    expect(src).toContain('"open-history-btn"');
    expect(src).toContain("addEventListener");
  });

  test("handler opens history/history.html via browser.tabs.create", () => {
    const handlerBlock = src.slice(
      src.indexOf("open-history-btn"),
      src.indexOf("open-history-btn") + 400
    );
    expect(handlerBlock).toContain("history/history.html");
    expect(handlerBlock).toContain("browser.tabs.create");
  });

  test("handler closes the popup after opening the history tab", () => {
    const handlerBlock = src.slice(
      src.indexOf("open-history-btn"),
      src.indexOf("open-history-btn") + 400
    );
    expect(handlerBlock).toContain("window.close()");
  });
});

// ── popup/popup.html — bottom row DOM structure ───────────────────────────────

describe("popup/popup.html — .bottom-row contains History and Settings", () => {
  let src;
  beforeAll(() => {
    src = fs.readFileSync(path.join(ROOT, "popup/popup.html"), "utf8");
  });

  test("popup.html contains #open-history-btn", () => {
    expect(src).toContain('id="open-history-btn"');
  });

  test("popup.html contains #open-settings", () => {
    expect(src).toContain('id="open-settings"');
  });

  test("both buttons are inside .bottom-row", () => {
    const bottomRow = src.slice(
      src.indexOf('class="bottom-row"'),
      src.indexOf('class="bottom-row"') + 300
    );
    expect(bottomRow).toContain("open-history-btn");
    expect(bottomRow).toContain("open-settings");
  });

  test("#open-history-btn appears before #open-settings in markup order", () => {
    expect(src.indexOf("open-history-btn")).toBeLessThan(src.indexOf('"open-settings"'));
  });

  test("popup.html has no standalone full-width settings button (replaced by bottom-row)", () => {
    // Old pattern was a lone <button id="open-settings"> outside any row
    // New pattern puts it inside .bottom-row
    const bottomRowIdx = src.indexOf('class="bottom-row"');
    const settingsIdx  = src.indexOf('"open-settings"');
    expect(settingsIdx).toBeGreaterThan(bottomRowIdx);
  });
});

// ── popup/popup.css — .bottom-row layout ─────────────────────────────────────

describe("popup/popup.css — .bottom-row layout rules", () => {
  let css;
  beforeAll(() => {
    css = fs.readFileSync(path.join(ROOT, "popup/popup.css"), "utf8");
  });

  test(".bottom-row is defined", () => {
    expect(css).toContain(".bottom-row {");
  });

  test(".bottom-row uses flex layout", () => {
    const rule = css.slice(css.indexOf(".bottom-row {"), css.indexOf(".bottom-row {") + 200);
    expect(rule).toContain("display: flex");
  });

  test(".bottom-row buttons have flex: 1 (equal width by default)", () => {
    const rule = css.slice(css.indexOf(".bottom-row button"), css.indexOf(".bottom-row button") + 200);
    expect(rule).toContain("flex: 1");
  });

  test("#open-settings has flex: 2 (Settings is wider than History)", () => {
    const rule = css.slice(css.indexOf("#open-settings"), css.indexOf("#open-settings") + 100);
    expect(rule).toContain("flex: 2");
  });
});

// ── popup/popup.css — #result-expand-btn ────────────────────────────────────

describe("popup/popup.css — #result-expand-btn expand/stack toggle button", () => {
  let css;
  beforeAll(() => {
    css = fs.readFileSync(path.join(ROOT, "popup/popup.css"), "utf8");
  });

  test("#result-expand-btn is defined", () => {
    expect(css).toContain("#result-expand-btn {");
  });

  test("#result-expand-btn spans full width", () => {
    const rule = css.slice(css.indexOf("#result-expand-btn {"), css.indexOf("#result-expand-btn {") + 300);
    expect(rule).toContain("width: 100%");
  });

  test("#result-expand-btn removes default outline (no focus glow)", () => {
    const rule = css.slice(css.indexOf("#result-expand-btn {"), css.indexOf("#result-expand-btn {") + 450);
    expect(rule).toContain("outline: none");
  });

  test("#result-expand-btn has a cursor: pointer", () => {
    const rule = css.slice(css.indexOf("#result-expand-btn {"), css.indexOf("#result-expand-btn {") + 450);
    expect(rule).toContain("cursor: pointer");
  });

  test("#result-expand-btn:hover rule is defined", () => {
    expect(css).toContain("#result-expand-btn:hover");
  });

  test("#result-expand-btn:hover changes border or color on hover", () => {
    const hoverRule = css.slice(css.indexOf("#result-expand-btn:hover"), css.indexOf("#result-expand-btn:hover") + 100);
    expect(hoverRule).toMatch(/border|color/);
  });
});
