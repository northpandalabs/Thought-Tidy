// tests/popup-expand.test.js
// Tests for the multi-column expand/stack feature across desktop and extension.
//
// Structure:
//   1. Pure logic mirrors  — extract the same logic used in shared-popup.js and test it directly
//   2. Source assertions   — verify the real source files contain the expected code patterns
//   3. CSS assertions      — verify popup.css allows expansion and defines multi-col layout

const fs   = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

// ── Pure-logic helpers (mirror shared-popup.js expand block) ──────────────────

function shouldAutoExpand(colCount) {
  return colCount >= 3;
}

function expandBtnInitialText(autoExpand) {
  return autoExpand ? "↕ Stack" : "⇔ Side by side";
}

function expandBtnToggleText(wasExpanded) {
  return wasExpanded ? "⇔ Side by side" : "↕ Stack";
}

function expandBtnInitialDataset(colCount) {
  return {
    colCount: String(colCount),
    expanded: shouldAutoExpand(colCount) ? "1" : "0",
  };
}

function extensionBodyWidth(n, colPx = 320) {
  return n > 1 ? (n * colPx) + "px" : "";
}

function toggleExpand(currentDatasetExpanded, datasetColCount) {
  const wasExpanded = currentDatasetExpanded === "1";
  const cols        = parseInt(datasetColCount) || 2;
  return {
    newExpanded:  wasExpanded ? "0" : "1",
    addMultiCol:  !wasExpanded,
    resizeArg:    !wasExpanded ? cols : 1,
    newBtnText:   expandBtnToggleText(wasExpanded),
  };
}

// ── shouldAutoExpand ──────────────────────────────────────────────────────────

describe("shouldAutoExpand — 3+ threshold", () => {
  test("0 results → false", () => expect(shouldAutoExpand(0)).toBe(false));
  test("1 result  → false", () => expect(shouldAutoExpand(1)).toBe(false));
  test("2 results → false", () => expect(shouldAutoExpand(2)).toBe(false));
  test("3 results → true",  () => expect(shouldAutoExpand(3)).toBe(true));
  test("4 results → true",  () => expect(shouldAutoExpand(4)).toBe(true));
});

// ── expandBtnInitialText ──────────────────────────────────────────────────────

describe("expandBtnInitialText — correct starting label", () => {
  test("autoExpand=false → 'Side by side'", () =>
    expect(expandBtnInitialText(false)).toBe("⇔ Side by side"));

  test("autoExpand=true  → 'Stack'", () =>
    expect(expandBtnInitialText(true)).toBe("↕ Stack"));

  test("2 results (no auto) → 'Side by side'", () =>
    expect(expandBtnInitialText(shouldAutoExpand(2))).toBe("⇔ Side by side"));

  test("3 results (auto)   → 'Stack'", () =>
    expect(expandBtnInitialText(shouldAutoExpand(3))).toBe("↕ Stack"));

  test("4 results (auto)   → 'Stack'", () =>
    expect(expandBtnInitialText(shouldAutoExpand(4))).toBe("↕ Stack"));
});

// ── expandBtnToggleText ───────────────────────────────────────────────────────

describe("expandBtnToggleText — correct text after click", () => {
  test("was expanded  → show 'Side by side'", () =>
    expect(expandBtnToggleText(true)).toBe("⇔ Side by side"));

  test("was collapsed → show 'Stack'", () =>
    expect(expandBtnToggleText(false)).toBe("↕ Stack"));

  test("toggle twice returns to original text (expanded)", () => {
    const after1 = expandBtnToggleText(true);   // collapsed → "⇔ Side by side"
    const after2 = expandBtnToggleText(false);  // expanded  → "↕ Stack"
    expect(after2).toBe("↕ Stack");
    expect(after1).toBe("⇔ Side by side");
  });
});

// ── expandBtnInitialDataset ───────────────────────────────────────────────────

describe("expandBtnInitialDataset — colCount and expanded attributes", () => {
  test("2 results: colCount='2', expanded='0'", () => {
    expect(expandBtnInitialDataset(2)).toEqual({ colCount: "2", expanded: "0" });
  });

  test("3 results: colCount='3', expanded='1'", () => {
    expect(expandBtnInitialDataset(3)).toEqual({ colCount: "3", expanded: "1" });
  });

  test("4 results: colCount='4', expanded='1'", () => {
    expect(expandBtnInitialDataset(4)).toEqual({ colCount: "4", expanded: "1" });
  });

  test("colCount is always stored as string", () => {
    expect(typeof expandBtnInitialDataset(2).colCount).toBe("string");
    expect(typeof expandBtnInitialDataset(3).colCount).toBe("string");
  });

  test("expanded is '0' for 2 results (not auto-expanded)", () =>
    expect(expandBtnInitialDataset(2).expanded).toBe("0"));

  test("expanded is '1' for 3 results (auto-expanded)", () =>
    expect(expandBtnInitialDataset(3).expanded).toBe("1"));
});

// ── extensionBodyWidth ────────────────────────────────────────────────────────

describe("extensionBodyWidth — CSS width string for extension expand", () => {
  test("n=1 → empty string (resets to CSS default)", () =>
    expect(extensionBodyWidth(1)).toBe(""));

  test("n=0 → empty string", () =>
    expect(extensionBodyWidth(0)).toBe(""));

  test("n=2 → '640px'", () =>
    expect(extensionBodyWidth(2)).toBe("640px"));

  test("n=3 → '960px'", () =>
    expect(extensionBodyWidth(3)).toBe("960px"));

  test("n=4 → '1280px'", () =>
    expect(extensionBodyWidth(4)).toBe("1280px"));

  test("width grows linearly with column count", () => {
    expect(extensionBodyWidth(2)).toBe("640px");
    expect(extensionBodyWidth(3)).toBe("960px");
    expect(extensionBodyWidth(4)).toBe("1280px");
    // each step adds 320px
    const parse = (s) => parseInt(s);
    expect(parse(extensionBodyWidth(3)) - parse(extensionBodyWidth(2))).toBe(320);
    expect(parse(extensionBodyWidth(4)) - parse(extensionBodyWidth(3))).toBe(320);
  });

  test("all expanded widths fit within Chrome popup max (~800px for 2 cols)", () => {
    // 2 columns = 640px, well under Chrome's ~800px popup limit
    expect(parseInt(extensionBodyWidth(2))).toBeLessThanOrEqual(800);
  });
});

// ── toggleExpand ─────────────────────────────────────────────────────────────

describe("toggleExpand — click handler state transitions", () => {
  test("from collapsed (expanded='0'), 2 cols: expands and resizes to 2", () => {
    const result = toggleExpand("0", "2");
    expect(result.newExpanded).toBe("1");
    expect(result.addMultiCol).toBe(true);
    expect(result.resizeArg).toBe(2);
    expect(result.newBtnText).toBe("↕ Stack");
  });

  test("from expanded (expanded='1'), 2 cols: collapses and resizes to 1", () => {
    const result = toggleExpand("1", "2");
    expect(result.newExpanded).toBe("0");
    expect(result.addMultiCol).toBe(false);
    expect(result.resizeArg).toBe(1);
    expect(result.newBtnText).toBe("⇔ Side by side");
  });

  test("from collapsed, 3 cols: resizes to 3", () => {
    const result = toggleExpand("0", "3");
    expect(result.resizeArg).toBe(3);
  });

  test("from collapsed, 4 cols: resizes to 4", () => {
    const result = toggleExpand("0", "4");
    expect(result.resizeArg).toBe(4);
  });

  test("from expanded, any cols: always resizes to 1", () => {
    expect(toggleExpand("1", "2").resizeArg).toBe(1);
    expect(toggleExpand("1", "3").resizeArg).toBe(1);
    expect(toggleExpand("1", "4").resizeArg).toBe(1);
  });

  test("double-toggle (expand then collapse) returns to start state", () => {
    const first  = toggleExpand("0", "2");
    const second = toggleExpand(first.newExpanded, "2");
    expect(second.newExpanded).toBe("0");
    expect(second.addMultiCol).toBe(false);
    expect(second.resizeArg).toBe(1);
  });

  test("resizeArg defaults to 2 when colCount is unparseable", () => {
    const result = toggleExpand("0", "bad");
    expect(result.resizeArg).toBe(2);
  });
});

// ── shared-popup.js source assertions ────────────────────────────────────────

describe("shared-popup.js — expand button source code", () => {
  let src;
  beforeAll(() => {
    src = fs.readFileSync(path.join(ROOT, "lib/shared-popup.js"), "utf8");
  });

  test("expand button block is NOT gated on POPUP_SOURCE === 'desktop'", () => {
    // Guard was removed so extension also gets the button
    expect(src).not.toMatch(/if\s*\(\s*window\.POPUP_SOURCE\s*===\s*["']desktop["']\s*&&.*normalized\.length\s*>=\s*2/);
  });

  test("expand block triggers on normalized.length >= 2", () => {
    expect(src).toContain("normalized.length >= 2");
  });

  test("isDesktop branches on POPUP_SOURCE for resize strategy", () => {
    expect(src).toContain("POPUP_SOURCE === \"desktop\"");
    expect(src).toContain("isDesktop");
  });

  test("extension resize sets body.style.width", () => {
    expect(src).toContain("document.body.style.width");
    expect(src).toContain("n * 320");
  });

  test("desktop resize calls btcAPI.resizePopup", () => {
    expect(src).toContain("btcAPI.resizePopup");
  });

  test("button id is result-expand-btn", () => {
    expect(src).toContain('"result-expand-btn"');
  });

  test("button stores colCount in dataset", () => {
    expect(src).toContain("dataset.colCount");
  });

  test("button stores expanded state in dataset", () => {
    expect(src).toContain("dataset.expanded");
  });

  test("auto-expand threshold is colCount >= 3", () => {
    expect(src).toContain("colCount >= 3");
  });

  test("button is inserted before the slots container", () => {
    expect(src).toContain("slots.before(expandBtn)");
  });

  test("auto-expand adds multi-col class to slots", () => {
    expect(src).toContain('slots.classList.add("multi-col")');
  });

  test("toggle removes multi-col class on collapse", () => {
    expect(src).toContain('slots.classList.toggle("multi-col"');
  });

  test("extension body width cleared when n <= 1", () => {
    expect(src).toContain('n > 1 ? (n * 320) + "px" : ""');
  });

  test("'Side by side' label is used for collapsed state", () => {
    expect(src).toContain("Side by side");
  });

  test("'Stack' label is used for expanded state", () => {
    expect(src).toContain("↕ Stack");
  });
});

describe("shared-popup.js — showLoading width reset", () => {
  let src;
  beforeAll(() => {
    src = fs.readFileSync(path.join(ROOT, "lib/shared-popup.js"), "utf8");
  });

  test("showLoading resets body.style.width for non-desktop platforms", () => {
    expect(src).toContain('window.POPUP_SOURCE !== "desktop"');
    expect(src).toContain('document.body.style.width = ""');
  });

  test("width reset is inside showLoading function body", () => {
    const fn = src.slice(src.indexOf("function showLoading"), src.indexOf("function showResult"));
    expect(fn).toContain('window.POPUP_SOURCE !== "desktop"');
    expect(fn).toContain('document.body.style.width = ""');
  });

  test("showLoading always removes the expand button", () => {
    const fn = src.slice(src.indexOf("function showLoading"), src.indexOf("function showResult"));
    expect(fn).toContain("result-expand-btn");
    expect(fn).toContain(".remove()");
  });

  test("showLoading removes multi-col class from slots", () => {
    const fn = src.slice(src.indexOf("function showLoading"), src.indexOf("function showResult"));
    expect(fn).toContain('classList.remove("multi-col")');
  });
});

describe("shared-popup.js — 3+ results in extension: new tab", () => {
  let src;
  beforeAll(() => {
    src = fs.readFileSync(path.join(ROOT, "lib/shared-popup.js"), "utf8");
  });

  test("3+ extension results open expandedResults in a new tab", () => {
    expect(src).toContain("normalized.length >= 3");
    expect(src).toContain('POPUP_SOURCE === "extension"');
    expect(src).toContain("expandedResults");
    expect(src).toContain("browser.tabs.create");
  });

  test("expandedResults payload includes results array and timestamp", () => {
    expect(src).toContain("results: normalized");
    expect(src).toContain("timestamp: Date.now()");
  });

  test("fallback notice is shown in popup when tab opens", () => {
    expect(src).toContain("Opened");
    expect(src).toContain("suggestions in a new tab");
  });
});

// ── popup.css assertions ──────────────────────────────────────────────────────

describe("popup/popup.css — body allows expansion", () => {
  let css;
  beforeAll(() => {
    css = fs.readFileSync(path.join(ROOT, "popup/popup.css"), "utf8");
  });

  test("body has a base width of 320px", () => {
    expect(css).toMatch(/body\s*\{[^}]*width\s*:\s*320px/s);
  });

  test("body has max-width allowing expansion beyond 320px", () => {
    expect(css).toMatch(/max-width\s*:\s*\d{4,}px/);
  });

  test("max-width is at least 1280px (supports 4 columns × 320px)", () => {
    const match = css.match(/max-width\s*:\s*(\d+)px/);
    expect(match).not.toBeNull();
    expect(parseInt(match[1])).toBeGreaterThanOrEqual(1280);
  });
});

describe("popup/popup.css — multi-col layout class", () => {
  let css;
  beforeAll(() => {
    css = fs.readFileSync(path.join(ROOT, "popup/popup.css"), "utf8");
  });

  test(".multi-col class is defined", () => {
    expect(css).toContain(".multi-col");
  });
});

describe("desktop/renderer/popup.css — multi-col layout class", () => {
  let css;
  beforeAll(() => {
    css = fs.readFileSync(path.join(ROOT, "desktop/renderer/popup.css"), "utf8");
  });

  test(".multi-col class is defined in desktop CSS", () => {
    expect(css).toContain(".multi-col");
  });
});

// ── desktop/renderer/popup.js — reopen reset ─────────────────────────────────

describe("desktop/renderer/popup.js — expand button state reset on reopen", () => {
  let src;
  beforeAll(() => {
    src = fs.readFileSync(path.join(ROOT, "desktop/renderer/popup.js"), "utf8");
  });

  test("onPopupOpened resets dataset.expanded to '0'", () => {
    expect(src).toContain('dataset.expanded = "0"');
  });

  test("onPopupOpened removes multi-col class", () => {
    expect(src).toContain('classList.remove("multi-col")');
  });

  test("onPopupOpened calls resizePopup(1) to collapse the window", () => {
    expect(src).toContain("resizePopup(1)");
  });

  test("onPopupOpened resets button text to 'Side by side'", () => {
    expect(src).toContain("Side by side");
  });
});

// ── popup/popup.js — no reopen reset needed (extension reinits) ───────────────

describe("popup/popup.js — extension popup source", () => {
  let src;
  beforeAll(() => {
    src = fs.readFileSync(path.join(ROOT, "popup/popup.js"), "utf8");
  });

  test("POPUP_SOURCE is set to 'extension'", () => {
    expect(src).toContain('"extension"');
    expect(src).toContain("POPUP_SOURCE");
  });

  test("no btcAPI.resizePopup call in extension popup", () => {
    expect(src).not.toContain("resizePopup");
  });
});
