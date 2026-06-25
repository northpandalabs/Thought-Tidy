// tests/popup-logic.test.js
// Unit tests for logic introduced in the popup UI improvements:
//   • Line-ending normalization
//   • Pro separator visibility gate
//   • No-provider guard
//   • 3+ results expand threshold
//   • expandedResults storage shape
//   • File structure (new pages, correct script load order)
//   • Guide page HTML content requirements
//   • Security scan of new JS files

const fs   = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

// ── pure helpers (mirror logic from shared-popup.js / runProcess) ──────────────

function normalizeLineEndings(text) {
  return (text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function hasAnyProvider(settings) {
  const hasProviders = Array.isArray(settings.configuredProviders) && settings.configuredProviders.length > 0;
  const hasLegacy    = settings.openaiKey || settings.claudeKey || settings.geminiKey;
  return hasProviders || !!hasLegacy;
}

function shouldShowProSeparator(isPro, hasProActions) {
  return hasProActions && !isPro;
}

function shouldExpandResults(count) {
  return count >= 3;
}

function makeExpandedResultsPayload(results) {
  return { results, timestamp: Date.now() };
}

// ── normalizeLineEndings ───────────────────────────────────────────────────────

describe("normalizeLineEndings — CRLF handling", () => {
  test("converts \\r\\n to \\n", () => {
    expect(normalizeLineEndings("line1\r\nline2")).toBe("line1\nline2");
  });

  test("converts bare \\r to \\n", () => {
    expect(normalizeLineEndings("line1\rline2")).toBe("line1\nline2");
  });

  test("leaves \\n-only strings unchanged", () => {
    expect(normalizeLineEndings("line1\nline2")).toBe("line1\nline2");
  });

  test("handles mixed CRLF and bare CR in same string", () => {
    const input  = "a\r\nb\rc";
    const output = normalizeLineEndings(input);
    expect(output).toBe("a\nb\nc");
  });

  test("converts multiple consecutive CRLF", () => {
    expect(normalizeLineEndings("a\r\n\r\nb")).toBe("a\n\nb");
  });

  test("returns empty string for empty input", () => {
    expect(normalizeLineEndings("")).toBe("");
  });

  test("returns empty string for null input", () => {
    expect(normalizeLineEndings(null)).toBe("");
  });

  test("returns empty string for undefined input", () => {
    expect(normalizeLineEndings(undefined)).toBe("");
  });

  test("leaves plain text without line endings unchanged", () => {
    expect(normalizeLineEndings("hello world")).toBe("hello world");
  });

  test("preserves trailing newline when already \\n", () => {
    expect(normalizeLineEndings("hello\n")).toBe("hello\n");
  });

  test("normalizes trailing CRLF to \\n", () => {
    expect(normalizeLineEndings("hello\r\n")).toBe("hello\n");
  });
});

// ── hasAnyProvider — no-provider guard ────────────────────────────────────────

describe("hasAnyProvider — configuration detection", () => {
  test("returns true when configuredProviders has entries", () => {
    expect(hasAnyProvider({ configuredProviders: [{ id: "gemini" }] })).toBe(true);
  });

  test("returns false when configuredProviders is empty array", () => {
    expect(hasAnyProvider({ configuredProviders: [] })).toBe(false);
  });

  test("returns false when configuredProviders is undefined", () => {
    expect(hasAnyProvider({})).toBe(false);
  });

  test("returns false when configuredProviders is null", () => {
    expect(hasAnyProvider({ configuredProviders: null })).toBe(false);
  });

  test("returns true for legacy openaiKey", () => {
    expect(hasAnyProvider({ openaiKey: "sk-abc123" })).toBe(true);
  });

  test("returns true for legacy claudeKey", () => {
    expect(hasAnyProvider({ claudeKey: "sk-ant-abc" })).toBe(true);
  });

  test("returns true for legacy geminiKey", () => {
    expect(hasAnyProvider({ geminiKey: "AIzaXYZ" })).toBe(true);
  });

  test("returns false when all legacy keys are empty strings", () => {
    expect(hasAnyProvider({ openaiKey: "", claudeKey: "", geminiKey: "" })).toBe(false);
  });

  test("returns false when all legacy keys are undefined", () => {
    expect(hasAnyProvider({ openaiKey: undefined, claudeKey: undefined, geminiKey: undefined })).toBe(false);
  });

  test("returns true when mixed: empty configuredProviders but valid openaiKey", () => {
    expect(hasAnyProvider({ configuredProviders: [], openaiKey: "sk-test" })).toBe(true);
  });

  test("returns true when configuredProviders has entries even if no legacy keys", () => {
    expect(hasAnyProvider({ configuredProviders: [{ id: "claude" }], openaiKey: "" })).toBe(true);
  });
});

// ── shouldShowProSeparator — Pro separator gate ────────────────────────────────

describe("shouldShowProSeparator — free vs Pro user view", () => {
  test("returns true for free user when Pro actions exist", () => {
    expect(shouldShowProSeparator(false, true)).toBe(true);
  });

  test("returns false for Pro user even when Pro actions exist", () => {
    expect(shouldShowProSeparator(true, true)).toBe(false);
  });

  test("returns false for free user when no Pro actions", () => {
    expect(shouldShowProSeparator(false, false)).toBe(false);
  });

  test("returns false for Pro user when no Pro actions", () => {
    expect(shouldShowProSeparator(true, false)).toBe(false);
  });
});

// ── shouldExpandResults — 3+ tab/window threshold ─────────────────────────────

describe("shouldExpandResults — open separate view for 3+ results", () => {
  test("returns false for 1 result", () => {
    expect(shouldExpandResults(1)).toBe(false);
  });

  test("returns false for 2 results", () => {
    expect(shouldExpandResults(2)).toBe(false);
  });

  test("returns true for exactly 3 results", () => {
    expect(shouldExpandResults(3)).toBe(true);
  });

  test("returns true for 4 results", () => {
    expect(shouldExpandResults(4)).toBe(true);
  });

  test("returns false for 0 results", () => {
    expect(shouldExpandResults(0)).toBe(false);
  });
});

// ── expandedResults — storage payload shape ───────────────────────────────────

describe("expandedResults — storage payload shape", () => {
  test("payload has a results array", () => {
    const payload = makeExpandedResultsPayload(["a", "b", "c"]);
    expect(Array.isArray(payload.results)).toBe(true);
  });

  test("payload results length matches input", () => {
    const payload = makeExpandedResultsPayload(["x", "y", "z"]);
    expect(payload.results).toHaveLength(3);
  });

  test("payload has a numeric timestamp", () => {
    const payload = makeExpandedResultsPayload(["a"]);
    expect(typeof payload.timestamp).toBe("number");
    expect(payload.timestamp).toBeGreaterThan(0);
  });

  test("timestamp is within 1 second of now", () => {
    const before  = Date.now();
    const payload = makeExpandedResultsPayload(["test"]);
    const after   = Date.now();
    expect(payload.timestamp).toBeGreaterThanOrEqual(before);
    expect(payload.timestamp).toBeLessThanOrEqual(after);
  });

  test("payload preserves result text content", () => {
    const texts   = ["First suggestion", "Second suggestion", "Third suggestion"];
    const payload = makeExpandedResultsPayload(texts);
    expect(payload.results).toEqual(texts);
  });

  test("results key is exactly 'results' (storage contract)", () => {
    const payload = makeExpandedResultsPayload([]);
    expect(Object.keys(payload)).toContain("results");
    expect(Object.keys(payload)).toContain("timestamp");
  });
});

// ── file existence — new pages ─────────────────────────────────────────────────

describe("new page files — existence", () => {
  const files = [
    "popup/results.html",
    "popup/results.js",
    "popup/results.css",
    "popup/guide.html",
    "popup/guide.css",
    "popup/guide.js",
  ];

  for (const rel of files) {
    test(`${rel} exists`, () => {
      expect(fs.existsSync(path.join(ROOT, rel))).toBe(true);
    });
  }
});

// ── popup/results.html — structure ────────────────────────────────────────────

describe("popup/results.html — structure", () => {
  let html;

  beforeAll(() => {
    html = fs.readFileSync(path.join(ROOT, "popup/results.html"), "utf8");
  });

  test("references results.js", () => {
    expect(html).toContain("results.js");
  });

  test("references results.css stylesheet", () => {
    expect(html).toContain("results.css");
  });

  test("contains results-container element", () => {
    expect(html).toContain('id="results-container"');
  });

  test("contains top-count element", () => {
    expect(html).toContain('id="top-count"');
  });

  test("does not load browser-polyfill.js (results.js self-bootstraps)", () => {
    expect(html).not.toContain("browser-polyfill.js");
  });
});

// ── guide page HTML structure ──────────────────────────────────────────────────

describe("popup/guide.html — content structure", () => {
  let html;

  beforeAll(() => {
    html = fs.readFileSync(path.join(ROOT, "popup/guide.html"), "utf8");
  });

  test("has exactly 4 provider tab buttons", () => {
    // count by data-tab= attribute — each tab button has exactly one
    const tabs = (html.match(/data-tab="/g) || []).length;
    expect(tabs).toBe(4);
  });

  test("has Gemini provider tab (data-tab=gemini)", () => {
    expect(html).toContain('data-tab="gemini"');
  });

  test("has OpenAI provider tab (data-tab=openai)", () => {
    expect(html).toContain('data-tab="openai"');
  });

  test("has Claude provider tab (data-tab=claude)", () => {
    expect(html).toContain('data-tab="claude"');
  });

  test("has GitHub Copilot provider tab (data-tab=copilot)", () => {
    expect(html).toContain('data-tab="copilot"');
  });

  test("mentions AES-256-GCM encryption", () => {
    expect(html).toContain("AES-256-GCM");
  });

  test("mentions Gemini billing requirement for privacy", () => {
    expect(html.toLowerCase()).toContain("billing");
  });

  test("distinguishes free tier from paid API (tier-bad and tier-good present)", () => {
    expect(html).toContain("tier-bad");
    expect(html).toContain("tier-good");
  });

  test("includes GitHub source link", () => {
    expect(html).toContain("github.com");
  });

  test("has privacy badge for Gemini panel", () => {
    expect(html).toContain('class="privacy-badge gemini"');
  });

  test("privacy badges reference provider API terms links", () => {
    // Each provider tab must have an external link to their API terms
    expect(html).toContain("ai.google.dev");
    expect(html).toContain("openai.com");
    expect(html).toContain("anthropic.com");
  });

  test("step numbers are present (step-num class)", () => {
    const stepNums = (html.match(/class="step-num"/g) || []).length;
    expect(stepNums).toBeGreaterThanOrEqual(3);
  });

  test("Gemini tab is marked active by default", () => {
    expect(html).toMatch(/ptab active[^"]*"[^>]*data-tab="gemini"|ptab[^"]*"[^>]*data-tab="gemini"[^>]*active/);
  });

  test("all external links use rel=noopener", () => {
    const extLinks = html.match(/href="https?:\/\/[^"]+"/g) || [];
    const withoutNoopener = extLinks.filter((_, i) => {
      // Check nearby context for rel=noopener
      const start = html.indexOf(extLinks[i]);
      const slice = html.slice(start, start + 200);
      return !slice.includes("noopener");
    });
    expect(withoutNoopener).toHaveLength(0);
  });

  test("loads guide.css stylesheet", () => {
    expect(html).toContain("guide.css");
  });

  test("loads guide.js script", () => {
    expect(html).toContain("guide.js");
  });

  test("references browser-polyfill.js for theme init", () => {
    expect(html).toContain("browser-polyfill.js");
  });
});

// ── results.js — logic and safety ─────────────────────────────────────────────

describe("popup/results.js — implementation checks", () => {
  let src;

  beforeAll(() => {
    src = fs.readFileSync(path.join(ROOT, "popup/results.js"), "utf8");
  });

  test("self-bootstraps browser for desktop via btcAPI check", () => {
    expect(src).toContain("typeof btcAPI");
    expect(src).toContain("btcAPI.getSettings");
  });

  test("self-bootstraps browser for Chrome extension via chrome.storage check", () => {
    expect(src).toContain("typeof chrome");
    expect(src).toContain("chrome.storage.local");
  });

  test("skips bootstrap when browser is already defined (Firefox / polyfill)", () => {
    expect(src).toContain("typeof browser");
  });

  test("reads expandedResults from browser.storage.local", () => {
    expect(src).toContain("expandedResults");
    expect(src).toContain("browser.storage.local");
  });

  test("reads themeMode for theme application", () => {
    expect(src).toContain("themeMode");
  });

  test("uses textContent (not innerHTML) for card body text", () => {
    expect(src).toContain("body.textContent");
    expect(src).not.toMatch(/body\.innerHTML\s*=\s*[a-zA-Z_$]/);
  });

  test("uses textContent (not innerHTML) for card label", () => {
    expect(src).toContain("label.textContent");
  });

  test("Copy button resets its label after a timeout", () => {
    expect(src).toContain("Copied!");
    expect(src).toContain("setTimeout");
  });

  test("uses contentEditable on card body (editable results)", () => {
    expect(src).toContain('contentEditable = "true"');
  });

  test("no eval() in results.js", () => {
    expect(src).not.toMatch(/\beval\s*\(/);
  });
});

// ── guide.js — implementation checks ──────────────────────────────────────────

describe("popup/guide.js — implementation checks", () => {
  let src;

  beforeAll(() => {
    src = fs.readFileSync(path.join(ROOT, "popup/guide.js"), "utf8");
  });

  test("reads themeMode from browser.storage.local", () => {
    expect(src).toContain("themeMode");
    expect(src).toContain("browser.storage.local");
  });

  test("wires provider tab click handlers", () => {
    expect(src).toContain(".ptab");
    expect(src).toContain("click");
  });

  test("supports hash-based deep links to provider tabs", () => {
    expect(src).toContain("location.hash");
  });

  test("no eval() in guide.js", () => {
    expect(src).not.toMatch(/\beval\s*\(/);
  });

  test("no bare innerHTML variable assignment in guide.js", () => {
    const lines = src.split("\n");
    const bare  = lines.filter(l => /\.innerHTML\s*=\s*[a-zA-Z_$][a-zA-Z0-9_$.[\]'"]*\s*[;,)]/.test(l));
    expect(bare).toHaveLength(0);
  });
});

// ── setup hint — _setupHint storage key contract ──────────────────────────────

describe("_setupHint — storage key contract", () => {
  // The key name must be consistent between popup.js (writer) and options.js (reader).
  // This test reads both files and confirms they use the exact same string.

  test("popup.js and options.js both reference _setupHint key", () => {
    const popupSrc  = fs.readFileSync(path.join(ROOT, "popup/popup.js"),     "utf8");
    const optionSrc = fs.readFileSync(path.join(ROOT, "options/options.js"), "utf8");
    expect(popupSrc).toContain("_setupHint");
    expect(optionSrc).toContain("_setupHint");
  });

  test("popup.js stores the value 'gemini' for the Gemini CTA", () => {
    const src = fs.readFileSync(path.join(ROOT, "popup/popup.js"), "utf8");
    expect(src).toContain('"gemini"');
    expect(src).toContain("_setupHint");
  });

  test("options.js removes _setupHint after reading it (avoids stale wizard)", () => {
    const src = fs.readFileSync(path.join(ROOT, "options/options.js"), "utf8");
    // Must both read and then remove the key
    expect(src).toContain("_setupHint");
    expect(src).toMatch(/remove.*_setupHint|_setupHint.*remove/s);
  });
});

// ── ipc-handlers.js — desktop openResults wiring ──────────────────────────────

describe("desktop/main.js — results window loads shared page", () => {
  let src;
  beforeAll(() => { src = fs.readFileSync(path.join(ROOT, "desktop/main.js"), "utf8"); });

  test("openResults references popup directory", () => {
    expect(src).toContain('"popup"');
    expect(src).toContain('"results.html"');
  });

  test("openResults does NOT reference renderer/results.html", () => {
    expect(src).not.toContain('"renderer", "results.html"');
    expect(src).not.toContain("renderer/results.html");
  });
});

describe("desktop/ipc-handlers.js — openResults IPC", () => {
  let src;

  beforeAll(() => {
    src = fs.readFileSync(path.join(ROOT, "desktop/ipc-handlers.js"), "utf8");
  });

  test("registers open-results IPC handle", () => {
    expect(src).toContain('"open-results"');
  });

  test("registerAll accepts openResults callback", () => {
    expect(src).toContain("openResults");
  });
});

describe("desktop/preload.js — openResults exposure", () => {
  let src;

  beforeAll(() => {
    src = fs.readFileSync(path.join(ROOT, "desktop/preload.js"), "utf8");
  });

  test("exposes openResults via contextBridge", () => {
    expect(src).toContain("openResults");
  });

  test("openResults invokes open-results IPC channel", () => {
    expect(src).toContain('"open-results"');
  });
});

// ── security scan — new JS files ───────────────────────────────────────────────

describe("security — new JS files", () => {
  const NEW_JS = [
    "popup/results.js",
    "popup/guide.js",
  ].map(f => path.join(ROOT, f));

  function scanLines(files, pattern) {
    const hits = [];
    for (const file of files) {
      const rel   = path.relative(ROOT, file);
      const lines = fs.readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        pattern.lastIndex = 0;
        if (pattern.test(line)) hits.push(`${rel}:${i + 1}  →  ${line.trim()}`);
      });
    }
    return hits;
  }

  test("no eval() in new popup JS files", () => {
    expect(scanLines(NEW_JS, /\beval\s*\(/g)).toHaveLength(0);
  });

  test("no new Function() in new popup JS files", () => {
    expect(scanLines(NEW_JS, /new\s+Function\s*\(/g)).toHaveLength(0);
  });

  test("no document.write() in new popup JS files", () => {
    expect(scanLines(NEW_JS, /document\.write\s*\(/g)).toHaveLength(0);
  });

  test("no bare-variable innerHTML assignment in new popup JS files", () => {
    // innerHTML = someVar is XSS; innerHTML = '' or template literals with esc() are fine
    const hits = scanLines(NEW_JS, /\.innerHTML\s*=\s*[a-zA-Z_$][a-zA-Z0-9_$.[\]'"]*\s*[;,)]/g);
    expect(hits).toHaveLength(0);
  });
});

// ── cleanPastedText / paste handler ───────────────────────────────────────────

// Mirror cleanPastedText logic from lib/shared-popup.js (plain-text path only)
function cleanPastedTextPlain(raw) {
  let text = raw;
  text = text.replace(/[​‌‍﻿]/g, "");
  text = text.replace(/ /g, " ");
  text = text.split("\n").map(l => l.trimEnd()).join("\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

describe("cleanPastedText — plain-text path (Teams/Outlook paste fix)", () => {
  test("strips zero-width spaces injected by Teams", () => {
    const input = "Hello​World";
    expect(cleanPastedTextPlain(input)).toBe("HelloWorld");
  });

  test("strips zero-width non-joiner characters", () => {
    expect(cleanPastedTextPlain("foo‌bar")).toBe("foobar");
  });

  test("strips BOM character", () => {
    expect(cleanPastedTextPlain("﻿Hello")).toBe("Hello");
  });

  test("normalises non-breaking spaces to regular spaces", () => {
    expect(cleanPastedTextPlain("Hello World")).toBe("Hello World");
  });

  test("collapses 3+ consecutive blank lines down to 2", () => {
    const input = "Para one\n\n\n\n\nPara two";
    expect(cleanPastedTextPlain(input)).toBe("Para one\n\nPara two");
  });

  test("preserves intentional double blank line", () => {
    const input = "Para one\n\nPara two";
    expect(cleanPastedTextPlain(input)).toBe("Para one\n\nPara two");
  });

  test("trims trailing whitespace on each line", () => {
    const input = "line one   \nline two  ";
    expect(cleanPastedTextPlain(input)).toBe("line one\nline two");
  });

  test("trims leading/trailing whitespace from overall text", () => {
    expect(cleanPastedTextPlain("\n\nHello\n\n")).toBe("Hello");
  });
});

describe("shared-popup.js paste handler — plain-text fallback", () => {
  let src;
  beforeAll(() => {
    src = fs.readFileSync(path.join(ROOT, "lib/shared-popup.js"), "utf8");
  });

  test("paste handler reads plain text from clipboardData when no HTML present", () => {
    expect(src).toContain('getData("text/plain")');
  });

  test("paste handler calls cleanPastedText with the plain-text content", () => {
    const fn = src.slice(src.indexOf("ta.addEventListener(\"paste\""), src.indexOf("function cleanPastedText"));
    expect(fn).toContain("html || plain");
    expect(fn).toContain("!!html");
  });

  test("paste handler calls e.preventDefault() for plain-text pastes too", () => {
    const fn = src.slice(src.indexOf("ta.addEventListener(\"paste\""), src.indexOf("function cleanPastedText"));
    expect(fn).toContain("e.preventDefault()");
    expect(fn).not.toContain("if (!html) return");
  });
});
