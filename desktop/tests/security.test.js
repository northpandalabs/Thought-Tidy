// Security checks specific to the Electron desktop app.
// Scans source files and validates critical Electron security settings.

const fs   = require("fs");
const path = require("path");

const DESKTOP_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT    = path.resolve(DESKTOP_ROOT, "..");

const EXCLUDE = new Set(["node_modules", "dist-build", ".git", "tests"]);

function collectJS(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!EXCLUDE.has(entry.name)) collectJS(path.join(dir, entry.name), results);
    } else if (entry.name.endsWith(".js")) {
      results.push(path.join(dir, entry.name));
    }
  }
  return results;
}

function scanLines(files, pattern) {
  const hits = [];
  for (const file of files) {
    const rel   = path.relative(DESKTOP_ROOT, file);
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      pattern.lastIndex = 0;
      if (pattern.test(line)) hits.push(`${rel}:${i + 1}  →  ${line.trim()}`);
    });
  }
  return hits;
}

function failWithHits(label, hits) {
  if (hits.length > 0) {
    throw new Error(
      `${label} in ${hits.length} location(s):\n` +
      hits.map(h => `  ${h}`).join("\n")
    );
  }
}

const desktopJS = collectJS(DESKTOP_ROOT);

// ── Credential scan ────────────────────────────────────────────────────────────

const CREDENTIAL_PATTERNS = [
  { name: "OpenAI API key",    pattern: /sk-[a-zA-Z0-9]{20,}/g },
  { name: "Anthropic API key", pattern: /sk-ant-[a-zA-Z0-9\-]{20,}/g },
  { name: "Google API key",    pattern: /AIza[a-zA-Z0-9_\-]{35}/g },
  { name: "AWS access key",    pattern: /AKIA[A-Z0-9]{16}/g },
  { name: "Private key block", pattern: /-----BEGIN .* PRIVATE KEY-----/g },
];

describe("credential scan — desktop source", () => {
  test("JS files found to scan", () => {
    expect(desktopJS.length).toBeGreaterThan(0);
  });

  for (const { name, pattern } of CREDENTIAL_PATTERNS) {
    test(`no hardcoded ${name}`, () => {
      failWithHits(`Hardcoded ${name}`, scanLines(desktopJS, pattern));
    });
  }
});

// ── Dangerous JS patterns ──────────────────────────────────────────────────────

describe("dangerous code patterns — desktop source", () => {
  test("no eval()", () => {
    failWithHits("eval() found", scanLines(desktopJS, /\beval\s*\(/g));
  });

  test("no new Function()", () => {
    failWithHits("new Function() found", scanLines(desktopJS, /new\s+Function\s*\(/g));
  });

  test("no string-based setTimeout/setInterval", () => {
    failWithHits(
      "String-based timer found",
      scanLines(desktopJS, /(?:setTimeout|setInterval)\s*\(\s*['"`]/g)
    );
  });

  test("all fetch() calls use HTTPS", () => {
    failWithHits(
      "Insecure HTTP fetch found",
      scanLines(desktopJS, /fetch\s*\(\s*['"]http:\/\//g)
    );
  });
});

// ── Electron-specific security ─────────────────────────────────────────────────

describe("Electron security settings — main.js", () => {
  const mainSrc = fs.readFileSync(path.join(DESKTOP_ROOT, "main.js"), "utf8");

  test("contextIsolation is set to true", () => {
    expect(mainSrc).toMatch(/contextIsolation\s*:\s*true/);
  });

  test("nodeIntegration is set to false", () => {
    expect(mainSrc).toMatch(/nodeIntegration\s*:\s*false/);
  });

  test("a preload script is specified", () => {
    expect(mainSrc).toMatch(/preload\s*:/);
    expect(mainSrc).toContain("preload.js");
  });

  test("shell.openExternal is used for URLs (not loadURL with user input)", () => {
    expect(mainSrc).toContain("shell.openExternal");
  });
});

describe("Electron security settings — preload.js", () => {
  const preloadSrc = fs.readFileSync(path.join(DESKTOP_ROOT, "preload.js"), "utf8");

  test("uses contextBridge.exposeInMainWorld (not window assignment)", () => {
    expect(preloadSrc).toContain("contextBridge.exposeInMainWorld");
  });

  test("does not expose ipcRenderer directly to the renderer", () => {
    // Exposing raw ipcRenderer lets the renderer call any channel arbitrarily
    expect(preloadSrc).not.toMatch(/exposeInMainWorld\s*\([^)]*ipcRenderer/);
  });

  test("exposes a named API object (btcAPI), not wildcard node globals", () => {
    expect(preloadSrc).toContain('"btcAPI"');
  });
});

// ── IPC surface audit ──────────────────────────────────────────────────────────

describe("IPC surface — ipc-handlers.js", () => {
  const handlerSrc = fs.readFileSync(path.join(DESKTOP_ROOT, "ipc-handlers.js"), "utf8");

  test("no arbitrary channel name exposure (handler names are whitelisted strings)", () => {
    // All ipcMain.handle calls must use string literals, not variables
    const dynamicHandle = /ipcMain\.handle\s*\(\s*(?!['"])/;
    expect(handlerSrc).not.toMatch(dynamicHandle);
  });

  test("open-url handler delegates to an injected callback (no inline shell.openExternal)", () => {
    // The handler itself should not import shell — that stays in main.js
    expect(handlerSrc).not.toContain("shell.openExternal");
    expect(handlerSrc).not.toContain("require(\"electron\")");
  });
});

// ── renderer files ─────────────────────────────────────────────────────────────

describe("renderer security — popup.js and settings.js", () => {
  const rendererDir = path.join(DESKTOP_ROOT, "renderer");
  const rendererJS  = ["popup.js", "settings.js"].map(f => path.join(rendererDir, f));

  test("renderer JS files use btcAPI (the bridge), not require()", () => {
    for (const file of rendererJS) {
      const src = fs.readFileSync(file, "utf8");
      expect(src).not.toMatch(/\brequire\s*\(/);
    }
  });

  test("renderer JS files do not access process or __dirname directly", () => {
    for (const file of rendererJS) {
      const src = fs.readFileSync(file, "utf8");
      expect(src).not.toMatch(/\bprocess\.env\b/);
      expect(src).not.toMatch(/\b__dirname\b/);
      expect(src).not.toMatch(/\b__filename\b/);
    }
  });

  test("no innerHTML assignment of raw variables in renderer", () => {
    const rendererSrcFiles = collectJS(rendererDir);
    failWithHits(
      "Bare-variable innerHTML assignment found",
      scanLines(rendererSrcFiles, /\.innerHTML\s*=\s*[a-zA-Z_$][a-zA-Z0-9_$.[\]'"]*\s*[;,)]/g)
    );
  });
});
