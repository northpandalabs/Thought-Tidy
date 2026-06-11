// tests/history-set-pin.test.js
// Tests for the "Set Passcode" button on the history page (extension + desktop).
//
// Structure:
//   1. Pure logic mirrors  — pin form validation rules
//   2. hashPin round-trip  — verify correct hash is stored and verifiable
//   3. Source assertions   — both history.js files have showSetPinBtn() wired in load()
//   4. Parity check        — extension and desktop implementations match

const fs   = require("fs");
const path = require("path");

const { hashPin, verifyPin } = require("../lib/history-pin");

const ROOT = path.resolve(__dirname, "..");

// ── Pure logic: form validation (mirrors save handler inside showSetPinBtn) ───

function validatePinForm(newPin, confirm) {
  if (!newPin || !confirm) return "Both fields are required.";
  if (newPin !== confirm)  return "Passcodes do not match.";
  return null;
}

describe("validatePinForm — mirrors showSetPinBtn save-handler validation", () => {
  test("returns error when new-pin field is empty", () => {
    expect(validatePinForm("", "abc")).toBe("Both fields are required.");
  });

  test("returns error when confirm field is empty", () => {
    expect(validatePinForm("abc", "")).toBe("Both fields are required.");
  });

  test("returns error when both fields are empty", () => {
    expect(validatePinForm("", "")).toBe("Both fields are required.");
  });

  test("returns mismatch error when pins differ", () => {
    expect(validatePinForm("abc", "xyz")).toBe("Passcodes do not match.");
  });

  test("returns null when both fields match", () => {
    expect(validatePinForm("mypin", "mypin")).toBeNull();
  });

  test("accepts single-character pin", () => {
    expect(validatePinForm("x", "x")).toBeNull();
  });

  test("accepts long pin", () => {
    const long = "a".repeat(128);
    expect(validatePinForm(long, long)).toBeNull();
  });

  test("case-sensitive — 'Pin' and 'pin' are different", () => {
    expect(validatePinForm("Pin", "pin")).toBe("Passcodes do not match.");
  });
});

// ── hashPin round-trip — what actually gets stored in historyPin ──────────────

describe("hashPin round-trip — stored hash is verifiable", () => {
  test("stored hash is never the plaintext pin", async () => {
    const pin  = "mysecretpin";
    const hash = await hashPin(pin);
    expect(hash).not.toBe(pin);
  });

  test("stored hash can be verified with the original pin", async () => {
    const pin  = "opensesame";
    const hash = await hashPin(pin);
    expect(await verifyPin(pin, hash)).toBe(true);
  });

  test("wrong pin fails verification against stored hash", async () => {
    const hash = await hashPin("correctpin");
    expect(await verifyPin("wrongpin", hash)).toBe(false);
  });

  test("empty pin hashes deterministically", async () => {
    const h1 = await hashPin("");
    const h2 = await hashPin("");
    expect(h1).toBe(h2);
  });
});

// ── Source assertions — history/history.js (extension) ───────────────────────

describe("history/history.js — showSetPinBtn wired into load()", () => {
  let src;
  beforeAll(() => {
    src = fs.readFileSync(path.join(ROOT, "history/history.js"), "utf8");
  });

  test("showSetPinBtn function is defined", () => {
    expect(src).toContain("function showSetPinBtn()");
  });

  test("load() calls showSetPinBtn() when no pin is set", () => {
    const loadFn = src.slice(
      src.indexOf("async function load()"),
      src.indexOf("function showSetPinBtn")
    );
    expect(loadFn).toContain("showSetPinBtn()");
  });

  test("load() calls loadHistory before showSetPinBtn", () => {
    const loadFn = src.slice(
      src.indexOf("async function load()"),
      src.indexOf("function showSetPinBtn")
    );
    expect(loadFn.indexOf("loadHistory(")).toBeLessThan(loadFn.indexOf("showSetPinBtn()"));
  });

  test("load() returns early via showPinGate when historyPin exists", () => {
    const loadFn = src.slice(
      src.indexOf("async function load()"),
      src.indexOf("function showSetPinBtn")
    );
    expect(loadFn).toContain("showPinGate");
    expect(loadFn).toContain("return");
  });

  test("showSetPinBtn() inserts button into .header-controls", () => {
    const fn = src.slice(
      src.indexOf("function showSetPinBtn()"),
      src.indexOf("function showPinGate")
    );
    expect(fn).toContain(".header-controls");
    expect(fn).toContain("insertBefore");
  });

  test("showSetPinBtn() guards against duplicate button insertion", () => {
    const fn = src.slice(
      src.indexOf("function showSetPinBtn()"),
      src.indexOf("function showPinGate")
    );
    expect(fn).toContain('"set-pin-btn"');
    expect(fn).toContain("document.getElementById");
  });

  test("save handler calls hashPin before storing", () => {
    const fn = src.slice(
      src.indexOf("function showSetPinBtn()"),
      src.indexOf("function showPinGate")
    );
    expect(fn).toContain("hashPin(");
  });

  test("save handler stores result under historyPin key", () => {
    const fn = src.slice(
      src.indexOf("function showSetPinBtn()"),
      src.indexOf("function showPinGate")
    );
    expect(fn).toContain("historyPin:");
  });

  test("save handler calls showPinManagement after storing pin", () => {
    const fn = src.slice(
      src.indexOf("function showSetPinBtn()"),
      src.indexOf("function showPinGate")
    );
    expect(fn).toContain("showPinManagement(");
  });

  test("save handler removes the Set Passcode button on success", () => {
    const fn = src.slice(
      src.indexOf("function showSetPinBtn()"),
      src.indexOf("function showPinGate")
    );
    expect(fn).toContain("btn.remove()");
  });

  test("button label includes 'Set Passcode'", () => {
    const fn = src.slice(
      src.indexOf("function showSetPinBtn()"),
      src.indexOf("function showPinGate")
    );
    expect(fn).toContain("Set Passcode");
  });
});

// ── Source assertions — desktop/renderer/history.js ──────────────────────────

describe("desktop/renderer/history.js — showSetPinBtn parity with extension", () => {
  let extSrc, deskSrc;
  beforeAll(() => {
    extSrc  = fs.readFileSync(path.join(ROOT, "history/history.js"),           "utf8");
    deskSrc = fs.readFileSync(path.join(ROOT, "desktop/renderer/history.js"), "utf8");
  });

  test("desktop defines showSetPinBtn()", () => {
    expect(deskSrc).toContain("function showSetPinBtn()");
  });

  test("desktop load() calls showSetPinBtn()", () => {
    const loadFn = deskSrc.slice(
      deskSrc.indexOf("async function load()"),
      deskSrc.indexOf("function showSetPinBtn")
    );
    expect(loadFn).toContain("showSetPinBtn()");
  });

  test("desktop showSetPinBtn() inserts into .header-controls", () => {
    const fn = deskSrc.slice(
      deskSrc.indexOf("function showSetPinBtn()"),
      deskSrc.indexOf("function showPinGate")
    );
    expect(fn).toContain(".header-controls");
  });

  test("desktop showSetPinBtn() calls hashPin", () => {
    const fn = deskSrc.slice(
      deskSrc.indexOf("function showSetPinBtn()"),
      deskSrc.indexOf("function showPinGate")
    );
    expect(fn).toContain("hashPin(");
  });

  test("desktop showSetPinBtn() stores historyPin", () => {
    const fn = deskSrc.slice(
      deskSrc.indexOf("function showSetPinBtn()"),
      deskSrc.indexOf("function showPinGate")
    );
    expect(fn).toContain("historyPin:");
  });

  test("desktop showSetPinBtn() calls showPinManagement", () => {
    const fn = deskSrc.slice(
      deskSrc.indexOf("function showSetPinBtn()"),
      deskSrc.indexOf("function showPinGate")
    );
    expect(fn).toContain("showPinManagement(");
  });

  test("both files read historyPin from storage in load()", () => {
    expect(extSrc).toContain('"historyPin"');
    expect(deskSrc).toContain('"historyPin"');
  });

  test("both files define showPinManagement (change/remove flow)", () => {
    expect(extSrc).toContain("function showPinManagement(");
    expect(deskSrc).toContain("function showPinManagement(");
  });

  test("both files define showPinGate (unlock flow)", () => {
    expect(extSrc).toContain("function showPinGate(");
    expect(deskSrc).toContain("function showPinGate(");
  });
});
