// tests/pack5-features.test.js
// Comprehensive tests for Pack 5 features:
//   #9  — Plain-text paste cleaning (Teams/Outlook junk removal)
//   #4  — EULA in installer (electron-builder.yml wiring)
//   #11 — Clarity Check action (new Pro-gated action)
//   #1  — Sound Like Me Vocab Tracker (profileVocab storage + prompt injection)

const fs   = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — mirror pure functions from source for direct testing
// ─────────────────────────────────────────────────────────────────────────────

// Mirror cleanPastedText (plain-text path) from lib/shared-popup.js
function cleanPastedTextPlain(raw) {
  let text = raw;
  text = text.replace(/[​‌‍﻿]/g, "");  // zero-width / invisible chars
  text = text.replace(/ /g, " ");      // non-breaking spaces → normal
  text = text.split("\n").map(l => l.trimEnd()).join("\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

// Mirror cleanPastedText (HTML path) — DOM-less simulation (strips tags naively)
function stripHtmlTags(html) {
  return html.replace(/<br\s*\/?>/gi, "\n")
             .replace(/<\/p>|<\/div>|<\/li>/gi, "\n")
             .replace(/<[^>]+>/g, "")
             .replace(/&nbsp;/g, " ")
             .replace(/&amp;/g, "&")
             .replace(/&lt;/g, "<")
             .replace(/&gt;/g, ">");
}

const { buildPromptWithProfile, MENU_PROMPTS, DEFAULT_ACTION_SETTINGS, LOCKED_ACTIONS } = require("../lib/prompts");


// =============================================================================
// FEATURE #9 — Plain-text paste cleaning
// =============================================================================

describe("#9 — cleanPastedText: plain-text path (Teams/Outlook fix)", () => {

  // ── zero-width / invisible character removal ──────────────────────────────

  test("strips zero-width space (U+200B) mid-word — injected by Teams", () => {
    expect(cleanPastedTextPlain("Hello​World")).toBe("HelloWorld");
  });

  test("strips zero-width non-joiner (U+200C)", () => {
    expect(cleanPastedTextPlain("foo‌bar")).toBe("foobar");
  });

  test("strips zero-width joiner (U+200D)", () => {
    expect(cleanPastedTextPlain("foo‍bar")).toBe("foobar");
  });

  test("strips BOM (U+FEFF) at start of pasted text — Outlook sometimes adds this", () => {
    expect(cleanPastedTextPlain("﻿Hello")).toBe("Hello");
  });

  test("strips multiple zero-width characters scattered through text", () => {
    expect(cleanPastedTextPlain("He​llo‌ Wo‍rld")).toBe("Hello World");
  });

  // ── non-breaking space normalisation ─────────────────────────────────────

  test("converts non-breaking space (U+00A0) to regular space", () => {
    expect(cleanPastedTextPlain("Hello World")).toBe("Hello World");
  });

  test("converts multiple consecutive non-breaking spaces", () => {
    expect(cleanPastedTextPlain("A  B")).toBe("A  B");
  });

  // ── blank-line collapsing (Outlook reply chain junk) ─────────────────────

  test("collapses 3 consecutive blank lines to 2", () => {
    expect(cleanPastedTextPlain("Para A\n\n\nPara B")).toBe("Para A\n\nPara B");
  });

  test("collapses 5 consecutive blank lines to 2", () => {
    expect(cleanPastedTextPlain("Para A\n\n\n\n\nPara B")).toBe("Para A\n\nPara B");
  });

  test("collapses 10 consecutive blank lines (Outlook deep reply chain)", () => {
    expect(cleanPastedTextPlain("Start\n\n\n\n\n\n\n\n\n\nEnd")).toBe("Start\n\nEnd");
  });

  test("preserves intentional single blank line (paragraph separator)", () => {
    expect(cleanPastedTextPlain("Para A\n\nPara B")).toBe("Para A\n\nPara B");
  });

  test("preserves single newline (line break within paragraph)", () => {
    expect(cleanPastedTextPlain("Line A\nLine B")).toBe("Line A\nLine B");
  });

  // ── trailing whitespace trimming ──────────────────────────────────────────

  test("strips trailing spaces from each line", () => {
    expect(cleanPastedTextPlain("line one   \nline two  ")).toBe("line one\nline two");
  });

  test("strips trailing tabs from each line", () => {
    expect(cleanPastedTextPlain("line one\t\t\nline two")).toBe("line one\nline two");
  });

  // ── overall trim ─────────────────────────────────────────────────────────

  test("trims leading blank lines", () => {
    expect(cleanPastedTextPlain("\n\nHello")).toBe("Hello");
  });

  test("trims trailing blank lines", () => {
    expect(cleanPastedTextPlain("Hello\n\n")).toBe("Hello");
  });

  test("handles text that is only whitespace — returns empty string", () => {
    expect(cleanPastedTextPlain("   \n\n   ")).toBe("");
  });

  test("handles empty string — returns empty string", () => {
    expect(cleanPastedTextPlain("")).toBe("");
  });

  // ── realistic Teams/Outlook scenarios ────────────────────────────────────

  test("cleans Teams message with zero-width chars and extra blank lines", () => {
    const raw = "Hey​,\n\n\n\nSounds good‌!\n\n\n\nThanks";
    expect(cleanPastedTextPlain(raw)).toBe("Hey,\n\nSounds good!\n\nThanks");
  });

  test("cleans Outlook reply header padding (multiple blank lines between blocks)", () => {
    const raw = "My reply here.\n\n\n\n\nFrom: Alice\nSent: Monday\nTo: Bob\nSubject: Re: Meeting";
    const cleaned = cleanPastedTextPlain(raw);
    expect(cleaned).toContain("My reply here.");
    expect(cleaned).toContain("From: Alice");
    // Only 2 blank lines between blocks (not 5)
    expect(cleaned).not.toMatch(/\n{3,}/);
  });
});

describe("#9 — paste handler source: correct guard and fallback", () => {
  let src;
  beforeAll(() => { src = fs.readFileSync(path.join(ROOT, "lib/shared-popup.js"), "utf8"); });

  test("paste handler reads html from clipboardData", () => {
    expect(src).toContain('getData("text/html")');
  });

  test("paste handler reads plain text as fallback", () => {
    expect(src).toContain('getData("text/plain")');
  });

  test("paste handler falls through to plain text when html is absent", () => {
    const handlerFn = src.slice(
      src.indexOf('ta.addEventListener("paste"'),
      src.indexOf("function cleanPastedText")
    );
    expect(handlerFn).toContain("html || plain");
  });

  test("paste handler passes isHtml flag as !!html", () => {
    const handlerFn = src.slice(
      src.indexOf('ta.addEventListener("paste"'),
      src.indexOf("function cleanPastedText")
    );
    expect(handlerFn).toContain("!!html");
  });

  test("paste handler does NOT early-return when only plain text is available", () => {
    const handlerFn = src.slice(
      src.indexOf('ta.addEventListener("paste"'),
      src.indexOf("function cleanPastedText")
    );
    expect(handlerFn).not.toContain("if (!html) return");
  });

  test("paste handler prevents default for both HTML and plain-text pastes", () => {
    const handlerFn = src.slice(
      src.indexOf('ta.addEventListener("paste"'),
      src.indexOf("function cleanPastedText")
    );
    expect(handlerFn).toContain("e.preventDefault()");
  });

  test("cleanPastedText strips zero-width chars in HTML mode too", () => {
    const cleanFn = src.slice(
      src.indexOf("function cleanPastedText"),
      src.indexOf("function insertAtCaret")
    );
    expect(cleanFn).toMatch(/​|‌|‍|﻿|zero.width|zero-width|\[​‌‍/i);
  });

  test("cleanPastedText collapses 3+ blank lines in HTML mode", () => {
    const cleanFn = src.slice(
      src.indexOf("function cleanPastedText"),
      src.indexOf("function insertAtCaret")
    );
    expect(cleanFn).toContain("\\n{3,}");
  });
});


// =============================================================================
// FEATURE #4 — EULA in installer
// =============================================================================

describe("#4 — electron-builder.yml: EULA and installer.nsh wiring", () => {
  let yml;
  beforeAll(() => { yml = fs.readFileSync(path.join(ROOT, "desktop/electron-builder.yml"), "utf8"); });

  test("nsis section contains a license key", () => {
    expect(yml).toMatch(/^\s*license:/m);
  });

  test("license key points to legal/eula.txt", () => {
    expect(yml).toContain("eula.txt");
  });

  test("nsis section contains include pointing to installer.nsh", () => {
    expect(yml).toContain("installer.nsh");
  });

  test("include path references build/installer.nsh", () => {
    expect(yml).toMatch(/include.*build\/installer\.nsh/);
  });

  test("nsis is not oneClick (user sees installer UI)", () => {
    expect(yml).toMatch(/oneClick:\s*false/);
  });

  test("allowToChangeInstallationDirectory is true (per-user install)", () => {
    expect(yml).toMatch(/allowToChangeInstallationDirectory:\s*true/);
  });
});

describe("#4 — electron-builder-test.yml: also has EULA", () => {
  let yml;
  beforeAll(() => { yml = fs.readFileSync(path.join(ROOT, "desktop/electron-builder-test.yml"), "utf8"); });

  test("test build nsis section also has a license key", () => {
    expect(yml).toMatch(/^\s*license:/m);
  });

  test("test build license also points to eula.txt", () => {
    expect(yml).toContain("eula.txt");
  });

  test("test build also includes installer.nsh", () => {
    expect(yml).toContain("installer.nsh");
  });
});

describe("#4 — legal/eula.txt: file exists and has content", () => {
  let eula;
  beforeAll(() => { eula = fs.readFileSync(path.join(ROOT, "legal/eula.txt"), "utf8"); });

  test("legal/eula.txt exists and is non-empty", () => {
    expect(eula.length).toBeGreaterThan(100);
  });

  test("EULA mentions the product name Thought Tidy", () => {
    expect(eula.toLowerCase()).toContain("thought tidy");
  });

  test("EULA contains license grant language", () => {
    expect(eula.toLowerCase()).toMatch(/license|grant|permitted/);
  });

  test("EULA contains limitation of liability language", () => {
    expect(eula.toLowerCase()).toMatch(/liability|warranty|warranties/);
  });
});

describe("#4 — desktop/build/installer.nsh: custom NSIS pages exist", () => {
  let nsh;
  beforeAll(() => { nsh = fs.readFileSync(path.join(ROOT, "desktop/build/installer.nsh"), "utf8"); });

  test("installer.nsh exists and is non-empty", () => {
    expect(nsh.length).toBeGreaterThan(100);
  });

  test("installer.nsh suppresses Nullsoft branding with BrandingText", () => {
    expect(nsh).toContain("BrandingText");
    expect(nsh).toContain("NorthPanda");
  });

  test("MaintenancePage exists (detects existing install, skip on fresh)", () => {
    expect(nsh).toContain("MaintenancePage");
  });

  test("MaintenancePage aborts on fresh install (no UninstallStr)", () => {
    expect(nsh).toContain("Abort");
  });

  test("IconUpdaterPage exists (setup options: shortcut, updater, startup)", () => {
    expect(nsh).toContain("IconUpdaterPage");
  });

  test("setup options include desktop shortcut checkbox", () => {
    expect(nsh.toLowerCase()).toContain("desktop shortcut");
  });

  test("setup options include auto-updater checkbox", () => {
    expect(nsh.toLowerCase()).toContain("auto-updater");
  });

  test("setup options include start with Windows checkbox", () => {
    expect(nsh.toLowerCase()).toContain("start with windows");
  });

  test("autoUpdater preference written to registry on install", () => {
    expect(nsh).toContain("autoUpdater");
    expect(nsh).toContain("WriteRegDWORD");
  });

  test("installer uses customWelcomePage macro to inject MaintenancePage", () => {
    expect(nsh).toContain("customWelcomePage");
  });

  test("installer uses customPageAfterChangeDir to inject IconUpdaterPage", () => {
    expect(nsh).toContain("customPageAfterChangeDir");
  });

  test("uninstaller removes startup shortcut on removal", () => {
    expect(nsh).toContain("customUnInstall");
    expect(nsh).toContain("Startup");
  });
});


// =============================================================================
// FEATURE #11 — Clarity Check action
// =============================================================================

describe("#11 — clarity-check: action definition", () => {
  test("clarity-check exists in DEFAULT_ACTION_SETTINGS", () => {
    const found = DEFAULT_ACTION_SETTINGS.find(a => a.id === "clarity-check");
    expect(found).toBeDefined();
  });

  test("clarity-check label is 'Clarity Check'", () => {
    const found = DEFAULT_ACTION_SETTINGS.find(a => a.id === "clarity-check");
    expect(found.label).toBe("Clarity Check");
  });

  test("clarity-check is enabled by default", () => {
    const found = DEFAULT_ACTION_SETTINGS.find(a => a.id === "clarity-check");
    expect(found.enabled).toBe(true);
  });

  test("clarity-check does NOT have clarify:true (different from brain-to-prompt)", () => {
    const found = DEFAULT_ACTION_SETTINGS.find(a => a.id === "clarity-check");
    expect(found.clarify).not.toBe(true);
  });

  test("clarity-check is in LOCKED_ACTIONS (built-in, cannot be renamed)", () => {
    expect(LOCKED_ACTIONS.has("clarity-check")).toBe(true);
  });

  test("clarity-check appears after 'expand' in the action list", () => {
    const ids = DEFAULT_ACTION_SETTINGS.map(a => a.id);
    expect(ids.indexOf("clarity-check")).toBeGreaterThan(ids.indexOf("expand"));
  });
});

describe("#11 — clarity-check: prompt quality", () => {
  const prompt = MENU_PROMPTS["clarity-check"];

  test("clarity-check has a prompt defined in MENU_PROMPTS", () => {
    expect(prompt).toBeTruthy();
    expect(typeof prompt).toBe("string");
  });

  test("clarity-check prompt is substantive (>100 chars)", () => {
    expect(prompt.length).toBeGreaterThan(100);
  });

  test("clarity-check prompt references a 1–10 scale", () => {
    expect(prompt).toMatch(/1.{0,5}10/);
  });

  test("clarity-check prompt includes the 'Clarity:' response header", () => {
    expect(prompt).toContain("Clarity:");
  });

  test("clarity-check prompt includes the score format ([score]/10)", () => {
    expect(prompt).toMatch(/\[score\]\/10/);
  });

  test("clarity-check prompt asks 'What are you trying to say' for unclear text", () => {
    expect(prompt).toContain("What are you trying to say");
  });

  test("clarity-check prompt has a high-score path (suggestions for clear text)", () => {
    expect(prompt).toMatch(/7 or above|score.*7|>=.*7/i);
  });

  test("clarity-check prompt has a low-score path (clarifying questions)", () => {
    expect(prompt).toMatch(/below 7|score.*below|< ?7/i);
  });

  test("clarity-check prompt instructs no preamble or extra commentary", () => {
    expect(prompt.toLowerCase()).toMatch(/no preamble|no explanation beyond/i);
  });
});

describe("#11 — clarity-check: Pro gating in shared-popup.js", () => {
  let src;
  beforeAll(() => { src = fs.readFileSync(path.join(ROOT, "lib/shared-popup.js"), "utf8"); });

  test("PRO_ACTION_IDS in shared-popup.js contains clarity-check", () => {
    const proLine = src.match(/const PRO_ACTION_IDS\s*=\s*new Set\([^)]+\)/);
    expect(proLine).not.toBeNull();
    expect(proLine[0]).toContain("clarity-check");
  });

  test("PRO_ACTION_IDS still contains all previous Pro actions", () => {
    const proLine = src.match(/const PRO_ACTION_IDS\s*=\s*new Set\([^)]+\)/)[0];
    ["sound-like-me", "sound-human", "formal", "casual", "shorten", "expand"].forEach(id => {
      expect(proLine).toContain(id);
    });
  });

  test("free and Pro actions are separated in the dropdown build", () => {
    expect(src).toContain("freeEnabled");
    expect(src).toContain("proEnabled");
  });
});


// =============================================================================
// FEATURE #1 — Sound Like Me Vocab Tracker
// =============================================================================

describe("#1 — buildPromptWithProfile: vocab injection", () => {
  const BASE = "Rewrite this. Return ONLY the rewritten text:";

  test("injects preferred words into the prompt", () => {
    const s = { profileEnabled: true, profileName: "Test", profileVocab: { prefer: ["gonna", "hey"] } };
    const result = buildPromptWithProfile(BASE, s);
    expect(result).toContain("gonna");
    expect(result).toContain("hey");
  });

  test("injects avoided words into the prompt", () => {
    const s = { profileEnabled: true, profileName: "Test", profileVocab: { avoid: ["leverage", "synergy"] } };
    const result = buildPromptWithProfile(BASE, s);
    expect(result).toContain("leverage");
    expect(result).toContain("synergy");
  });

  test("injects both prefer and avoid when both are set", () => {
    const s = {
      profileEnabled: true, profileName: "Test",
      profileVocab: { prefer: ["gonna"], avoid: ["leverage"] }
    };
    const result = buildPromptWithProfile(BASE, s);
    expect(result).toContain("gonna");
    expect(result).toContain("leverage");
  });

  test("prefer and avoid instructions are distinct in the prompt", () => {
    const s = {
      profileEnabled: true, profileName: "Test",
      profileVocab: { prefer: ["cool"], avoid: ["outstanding"] }
    };
    const result = buildPromptWithProfile(BASE, s);
    const preferIdx = result.indexOf("cool");
    const avoidIdx  = result.indexOf("outstanding");
    expect(preferIdx).not.toBe(avoidIdx);
  });

  test("prefer instruction uses 'Preferred' label", () => {
    const s = { profileEnabled: true, profileName: "Test", profileVocab: { prefer: ["cool"] } };
    expect(buildPromptWithProfile(BASE, s)).toMatch(/[Pp]referred.*cool|cool.*[Pp]referred/);
  });

  test("avoid instruction uses 'Avoided' or 'never use' label", () => {
    const s = { profileEnabled: true, profileName: "Test", profileVocab: { avoid: ["synergy"] } };
    const result = buildPromptWithProfile(BASE, s);
    expect(result).toMatch(/[Aa]void|never use/i);
  });

  test("vocab appears in the profile block before the base prompt", () => {
    const s = {
      profileEnabled: true, profileName: "Test",
      profileVocab: { prefer: ["gonna"], avoid: ["leverage"] }
    };
    const result = buildPromptWithProfile(BASE, s);
    expect(result.indexOf("gonna")).toBeLessThan(result.indexOf(BASE));
    expect(result.indexOf("leverage")).toBeLessThan(result.indexOf(BASE));
  });

  test("empty prefer list does not inject prefer label", () => {
    const s = { profileEnabled: true, profileName: "Test", profileVocab: { prefer: [], avoid: ["leverage"] } };
    expect(buildPromptWithProfile(BASE, s)).not.toMatch(/Preferred.*:/);
  });

  test("empty avoid list does not inject avoid label", () => {
    const s = { profileEnabled: true, profileName: "Test", profileVocab: { prefer: ["cool"], avoid: [] } };
    expect(buildPromptWithProfile(BASE, s)).not.toMatch(/Avoided.*:/);
  });

  test("both lists empty — no vocab injected at all", () => {
    const s = { profileEnabled: true, profileName: "Test", profileVocab: { prefer: [], avoid: [] } };
    const result = buildPromptWithProfile(BASE, s);
    expect(result).not.toContain("Preferred");
    expect(result).not.toContain("Avoided");
  });

  test("profileVocab absent — no vocab injected", () => {
    const s = { profileEnabled: true, profileName: "Test" };
    const result = buildPromptWithProfile(BASE, s);
    expect(result).not.toContain("Preferred");
    expect(result).not.toContain("Avoided");
  });

  test("profileEnabled false — vocab not injected even if profileVocab set", () => {
    const s = { profileEnabled: false, profileVocab: { prefer: ["gonna"], avoid: ["leverage"] } };
    expect(buildPromptWithProfile(BASE, s)).toBe(BASE);
  });

  test("vocab does not cause an empty profile block (name alone still works)", () => {
    const s = { profileEnabled: true, profileName: "Test", profileVocab: { prefer: ["gonna"] } };
    const result = buildPromptWithProfile(BASE, s);
    expect(result).toContain("Test");
    expect(result).toContain("gonna");
    expect(result).toContain(BASE);
  });

  test("filters out empty strings from prefer list", () => {
    const s = { profileEnabled: true, profileName: "Test", profileVocab: { prefer: ["", "valid", ""] } };
    const result = buildPromptWithProfile(BASE, s);
    expect(result).toContain("valid");
    const count = (result.match(/valid/g) || []).length;
    expect(count).toBe(1);
  });

  test("filters out empty strings from avoid list", () => {
    const s = { profileEnabled: true, profileName: "Test", profileVocab: { avoid: ["", "badword", ""] } };
    const result = buildPromptWithProfile(BASE, s);
    expect(result).toContain("badword");
  });
});

describe("#1 — vocab storage keys: profileVocab in all required locations", () => {
  test("profileVocab is in desktop/renderer/settings.js STORAGE_KEYS", () => {
    const src = fs.readFileSync(path.join(ROOT, "desktop/renderer/settings.js"), "utf8");
    const keysBlock = src.slice(src.indexOf("const STORAGE_KEYS"), src.indexOf("];", src.indexOf("const STORAGE_KEYS")) + 2);
    expect(keysBlock).toContain("profileVocab");
  });

  test("profileVocab is in options/options.js STORAGE_KEYS", () => {
    const src = fs.readFileSync(path.join(ROOT, "options/options.js"), "utf8");
    const keysBlock = src.slice(src.indexOf("const STORAGE_KEYS"), src.indexOf("];", src.indexOf("const STORAGE_KEYS")) + 2);
    expect(keysBlock).toContain("profileVocab");
  });

  test("profileVocab is in desktop/main.js _SYNC_KEYS (syncs between extension and desktop)", () => {
    const src = fs.readFileSync(path.join(ROOT, "desktop/main.js"), "utf8");
    const syncBlock = src.slice(src.indexOf("const _SYNC_KEYS"), src.indexOf(");", src.indexOf("const _SYNC_KEYS")) + 2);
    expect(syncBlock).toContain("profileVocab");
  });

  test("profileVocab is in shared-settings.js export/backup keys", () => {
    const src = fs.readFileSync(path.join(ROOT, "lib/shared-settings.js"), "utf8");
    // Find the appGet call in the export section
    expect(src).toContain('"profileVocab"');
  });
});

describe("#1 — initVocabSection: source code correctness", () => {
  let src;
  beforeAll(() => { src = fs.readFileSync(path.join(ROOT, "lib/shared-settings.js"), "utf8"); });

  test("initVocabSection function is defined in shared-settings.js", () => {
    expect(src).toContain("function initVocabSection(s)");
  });

  test("initVocabSection checks isProUnlocked — hidden for free users", () => {
    const fnBody = src.slice(
      src.indexOf("function initVocabSection(s)"),
      src.indexOf("function initGrammarFiltersSection")
    );
    expect(fnBody).toContain("isProUnlocked(s)");
  });

  test("initVocabSection attaches to #profile-section element", () => {
    const fnBody = src.slice(
      src.indexOf("function initVocabSection(s)"),
      src.indexOf("function initGrammarFiltersSection")
    );
    expect(fnBody).toContain("profile-section");
    expect(fnBody).toContain("profileSection.appendChild");
  });

  test("initVocabSection uses <details> collapsible pattern", () => {
    const fnBody = src.slice(
      src.indexOf("function initVocabSection(s)"),
      src.indexOf("function initGrammarFiltersSection")
    );
    expect(fnBody).toContain("createElement(\"details\")");
  });

  test("initVocabSection creates separate 'prefer' chip list", () => {
    const fnBody = src.slice(
      src.indexOf("function initVocabSection(s)"),
      src.indexOf("function initGrammarFiltersSection")
    );
    expect(fnBody).toContain("vocab-prefer-chips");
  });

  test("initVocabSection creates separate 'avoid' chip list", () => {
    const fnBody = src.slice(
      src.indexOf("function initVocabSection(s)"),
      src.indexOf("function initGrammarFiltersSection")
    );
    expect(fnBody).toContain("vocab-avoid-chips");
  });

  test("initVocabSection has an Add button wired to Enter key", () => {
    const fnBody = src.slice(
      src.indexOf("function initVocabSection(s)"),
      src.indexOf("function initGrammarFiltersSection")
    );
    expect(fnBody).toContain("Enter");
  });

  test("initVocabSection save button writes profileVocab to storage", () => {
    const fnBody = src.slice(
      src.indexOf("function initVocabSection(s)"),
      src.indexOf("function initGrammarFiltersSection")
    );
    expect(fnBody).toContain("profileVocab");
    expect(fnBody).toContain("appSet");
  });

  test("initVocabSection reads initial vocab from s.profileVocab", () => {
    const fnBody = src.slice(
      src.indexOf("function initVocabSection(s)"),
      src.indexOf("function initGrammarFiltersSection")
    );
    expect(fnBody).toContain("s.profileVocab");
  });

  test("initVocabSection shows saved status message after save", () => {
    const fnBody = src.slice(
      src.indexOf("function initVocabSection(s)"),
      src.indexOf("function initGrammarFiltersSection")
    );
    expect(fnBody).toContain("Saved!");
  });

  test("chip removal (×) button is created for each loaded phrase", () => {
    const fnBody = src.slice(
      src.indexOf("function initVocabSection(s)"),
      src.indexOf("function initGrammarFiltersSection")
    );
    expect(fnBody).toContain("chip.remove()");
  });
});

describe("#1 — initVocabSection: called by both platform settings files", () => {
  test("options/options.js calls initVocabSection(s)", () => {
    const src = fs.readFileSync(path.join(ROOT, "options/options.js"), "utf8");
    expect(src).toContain("initVocabSection(s)");
  });

  test("desktop/renderer/settings.js calls initVocabSection(s)", () => {
    const src = fs.readFileSync(path.join(ROOT, "desktop/renderer/settings.js"), "utf8");
    expect(src).toContain("initVocabSection(s)");
  });

  test("options/options.js calls initVocabSection before initGrammarFiltersSection", () => {
    const src = fs.readFileSync(path.join(ROOT, "options/options.js"), "utf8");
    expect(src.indexOf("initVocabSection")).toBeLessThan(src.indexOf("initGrammarFiltersSection"));
  });

  test("desktop/renderer/settings.js calls initVocabSection before initGrammarFiltersSection", () => {
    const src = fs.readFileSync(path.join(ROOT, "desktop/renderer/settings.js"), "utf8");
    expect(src.indexOf("initVocabSection")).toBeLessThan(src.indexOf("initGrammarFiltersSection"));
  });
});
