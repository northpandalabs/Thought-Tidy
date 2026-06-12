# Thought Tidy — Developer Reference

<p align="left">
  <img alt="Extension Tests" src="https://img.shields.io/badge/Extension_Tests-607_passing_%7C_2_skip-brightgreen?style=flat-square" />
  <img alt="Desktop Tests" src="https://img.shields.io/badge/Desktop_Tests-98_passing-brightgreen?style=flat-square" />
  <img alt="Ext Line Coverage" src="https://img.shields.io/badge/Ext_Coverage-98.33%25_lines-brightgreen?style=flat-square" />
  <img alt="Desktop Line Coverage" src="https://img.shields.io/badge/Desktop_Coverage-100%25_lines-brightgreen?style=flat-square" />
  <img alt="Build" src="https://img.shields.io/badge/build-v1.5.2-lightgrey?style=flat-square" />
</p>

Developer setup, build pipeline, test coverage, store publishing, and architecture notes.
For the user-facing overview, see [README.md](README.md).

---

## Stack

No bundler. No framework. Minimal build step — copies files and swaps the manifest background section per browser (service_worker for Chrome, scripts array for Firefox).

- Vanilla JS, HTML, CSS throughout
- Electron for the desktop app
- Jest for all tests
- `scripts/build.js` — the only build step (plain file copy + manifest swap)

---

## Architecture

```
lib/
  api.js              ← AI provider calls (OpenAI, Anthropic, Gemini, Ollama)
  prompts.js          ← system prompts, profile injection, action definitions
  models.js           ← model fetching & 7-day cache per provider
  shared-popup.js     ← popup logic shared between extension + desktop
  shared-settings.js  ← settings page logic shared between extension + desktop
  license.js          ← Pro license verification (Gumroad API)
  crypto-storage.js   ← AES-256-GCM key encryption (extension)
  export-import.js    ← .ttbackup encrypted backup (PBKDF2 + AES-256-GCM)
  history-pin.js      ← SHA-256 PIN hashing for history lock
  text.js             ← shared text utilities

popup/                ← extension toolbar popup (HTML/CSS/JS)
options/              ← extension settings page (HTML/CSS/JS)
background.js         ← extension service worker (context menu, run handlers)
content.js            ← in-page result modal injected into web pages
manifest.json         ← source manifest (MV3 Chrome base)

desktop/
  main.js             ← Electron main process (tray, IPC, sync server, updater)
  preload.js          ← contextIsolation bridge — exposes btcAPI to renderer
  ipc-handlers.js     ← IPC channel implementations
  renderer/           ← desktop popup + settings window (HTML/CSS/JS)
  lib-node/           ← Node-only code (updater.js, store.js, api.js re-export)
  tests/              ← Jest tests for desktop-specific code (~98 tests)

tests/                ← Jest unit + integration tests for lib/ (~607 tests)
scripts/
  build.js            ← produces dist/chrome/ and dist/firefox/
  generate-readme-images.js  ← generates SVG images for README
dist/
  chrome/             ← built Chrome extension (load unpacked here)
  firefox/            ← built Firefox extension (load temporary add-on here)
```

### Shared lib pattern

`lib/shared-popup.js` and `lib/shared-settings.js` are loaded in both the extension and the desktop renderer. They access storage via `window.appGet` / `window.appSet` adapter functions — each platform (extension, desktop) provides its own `app-storage.js` that implements those two functions on top of `browser.storage.local` or `electron-store`.

### Desktop IPC

The desktop uses Electron's `contextIsolation: true` + `nodeIntegration: false`. The preload script (`preload.js`) exposes `window.btcAPI` with 18 methods that cover all renderer→main communication. No raw IPC from renderer code.

### Extension↔Desktop Sync

Local HTTP server on `127.0.0.1:47391`. Session token generated at startup — required on every request. Syncs the keys listed in `SYNC_KEYS` (profile, custom prompts, provider settings, theme). Runs loopback-only; never leaves the machine.

---

## Building

### Prerequisites

```bash
# Extension
npm install        # installs webextension-polyfill + Jest

# Desktop
cd desktop
npm install
```

### Extension builds

```bash
npm run build          # both Chrome and Firefox
npm run build:chrome   # → dist/chrome/
npm run build:firefox  # → dist/firefox/
```

### Desktop — run locally

```bash
cd desktop
npm start          # launches Electron with DevTools open
```

### Desktop — build installers

```bash
cd desktop
npm run dist:win     # → dist-build/Thought Tidy Setup x.x.x.exe
npm run dist:mac     # → dist-build/Thought Tidy-x.x.x-arm64.dmg
npm run dist:linux   # → dist-build/Thought Tidy-x.x.x.AppImage
npm run dist         # current platform only
```

### Chrome vs Firefox build differences

| | Chrome (`dist/chrome/`) | Firefox (`dist/firefox/`) |
| --- | --- | --- |
| `background` in manifest | `"service_worker": "background.js"` | `"scripts": [...]` array |
| `importScripts()` in background.js | kept | stripped (deps in manifest) |
| `browser_specific_settings` | removed | `gecko.id` added |

---

## Running Tests

```bash
# Extension tests
npm test                          # all tests
npm test -- --coverage            # with coverage report
npm test -- tests/security.test.js  # single file

# Desktop tests
cd desktop && npm test
cd desktop && npm test -- --coverage
```

### Live API tests

`tests/utilization.test.js` makes real API calls — they **skip gracefully** when env vars are absent. Add a `.env` at the project root (gitignored):

```bash
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AIza...
CLAUDE_API_KEY=sk-ant-...
```

### Coverage (v1.5.2)

| Suite | Statements | Branches | Functions | Lines | Tests |
| --- | --- | --- | --- | --- | --- |
| Extension | 96.57% | 81.11% | 97.29% | **98.33%** | 607 pass / 2 skip |
| Desktop | 96.77% | 90.56% | 86.36% | **100%** | 98 pass |

Coverage reports:

| Suite | Command | Report |
| --- | --- | --- |
| Extension | `npm test -- --coverage` | `coverage/lcov-report/index.html` |
| Desktop | `cd desktop && npm test -- --coverage` | `desktop/coverage/lcov-report/index.html` |

---

## Security

Thought Tidy has no backend. All security surface is client-side. `tests/security.test.js` covers:

| Area | What is tested |
| --- | --- |
| **XSS prevention** | All user text rendered via `textContent` or `escHtml()` — never `innerHTML` |
| **API key storage** | Keys never logged or included in error messages; AES-256-GCM on extension, OS keychain on desktop |
| **Context isolation** | Electron enforces `contextIsolation: true`, `nodeIntegration: false` |
| **CSP** | Strict Content Security Policy in extension manifest — no inline scripts, no `eval` |
| **No PII leakage** | No analytics, no telemetry. Text goes only to the configured AI provider |
| **Sync token auth** | Desktop sync server (127.0.0.1:47391) requires a session token generated at startup |

Security test failures block the build — treated as Critical, must be remediated before any merge to `main`.

---

## Publishing to Extension Stores

### Chrome Web Store

1. `npm run build:chrome`
2. Zip `dist/chrome/`:
   ```powershell
   Compress-Archive -Path dist/chrome/* -DestinationPath thought-tidy-chrome.zip
   ```
3. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
4. **New Item** → upload zip → fill listing (name, description, screenshots, category: **Productivity**)
5. Submit for review — usually 1–3 business days

### Firefox Add-ons (AMO)

1. `npm run build:firefox`
2. Zip `dist/firefox/`:
   ```powershell
   Compress-Archive -Path dist/firefox/* -DestinationPath thought-tidy-firefox.zip
   ```
3. Go to [addons.mozilla.org/developers](https://addons.mozilla.org/developers/) → **Submit a New Add-on**
4. **Source code question:** Answer **No** — the build script only copies plain JS/CSS/HTML and adjusts the manifest. No minification, no webpack, no transpilation.
5. Submit for review — see `plans/FIREFOX-AMO.md` for the full listing copy

### Versioning

Before uploading, bump `version` in both `package.json` and `manifest.json` to match. Both stores reject re-uploads of the same version number.

---

## Release Process

1. Bump version in `manifest.json` and `desktop/package.json` (must match)
2. Run `npm test` and `cd desktop && npm test` — both must pass
3. Run `npm run build:chrome` and `npm run build:firefox` — both must succeed
4. Update `legal/downloads.json` — bump `version`, `released`, and the three desktop filenames (`windows`, `macos`, `linux`) to match the new version number
5. Commit with a descriptive message
6. Create an annotated tag:
   ```bash
   git tag -a v1.x.x -m "v1.x.x — short description"
   git push origin v1.x.x
   ```
7. The GitHub Actions release workflow (`.github/workflows/release.yml`) triggers automatically — runs tests, builds all platform installers, and publishes the GitHub Release with artifacts

> `npm run release` (from `desktop/`) requires a `GH_TOKEN` env var with `repo` scope.

---

## Website Download URLs (`legal/downloads.json`)

`legal/downloads.json` is the single source of truth for all platform download links. Website pages fetch this file at runtime so that updating one JSON file is all that's needed when a new version ships — no touching HTML.

**Raw URL (use this in `fetch()` calls):**
```
https://raw.githubusercontent.com/northpandalabs/Thought-Tidy/refs/heads/main/legal/downloads.json
```

**Structure:**
```json
{
  "version": "1.5.2",
  "released": "2026-06-11",
  "pro_url": "https://northpandalabs.gumroad.com/l/thought-tidy",
  "platforms": {
    "chrome":   { "label": "...", "url": "...", "filename": "..." },
    "firefox":  { "label": "...", "store_url": "...", "store_label": "Add to Firefox", "preferred": "store", "url": "...", "filename": "...", "download_label": "Download Build" },
    "windows":  { "label": "...", "url": "...", "filename": "..." },
    "macos":    { "label": "...", "url": "...", "filename": "..." },
    "linux":    { "label": "...", "url": "...", "filename": "..." }
  }
}
```

**What to update on each release:** `version`, `released`, and the `url` + `filename` for `windows`, `macos`, and `linux` (desktop filenames contain the version number). Chrome and Firefox download URLs use `/releases/latest/download/` and are version-agnostic — leave them alone. The Firefox `store_url` is permanent and never changes.

**How to wire it up in HTML:**

```html
<!-- add data-dl="chrome|firefox|windows|macos|linux" to any <a> tag -->
<a data-dl="chrome" href="#">Download for Chrome</a>
<span data-version></span>

<script>
  fetch('https://raw.githubusercontent.com/northpandalabs/Thought-Tidy/refs/heads/main/legal/downloads.json')
    .then(r => r.json())
    .then(d => {
      document.querySelectorAll('[data-dl]').forEach(el => {
        const p = d.platforms[el.dataset.dl];
        if (p) el.href = p.url;
      });
      document.querySelectorAll('[data-version]').forEach(el => {
        el.textContent = d.version;
      });
    });
</script>
```

---

## Generating README Images

The 4 SVG images embedded in `README.md` are generated from source by:

```bash
node scripts/generate-readme-images.js
```

Output: `plans/images/readme/` — re-run whenever the UI or features change.

Images generated:
- `how-it-works.svg` — 4-step flow diagram
- `popup-demo.svg` — popup UI mockup
- `before-after.svg` — brain dump before/after example
- `features-grid.svg` — Free vs Pro feature grid

---

## Contributing

PRs, issues, and forks welcome. Before submitting a PR:

1. Run `npm test` — extension tests must pass
2. Run `cd desktop && npm test` — desktop tests must pass
3. Run `npm run build:chrome` and `npm run build:firefox` — both must build cleanly
4. Don't introduce bundlers, frameworks, or new npm dependencies without discussion

The codebase is intentionally plain HTML/CSS/JS with no build complexity. Keep it that way.
