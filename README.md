# Thought Tidy

**AI writing assistant for fast thinkers — people who know exactly what they mean but struggle to make it look that way on screen.**

Highlight text, right-click, and let the AI clean it up instantly. No subscriptions. No accounts. No one reading your writing. Just your API key and a model that does what you tell it.

> Built by **[North Panda Labs](https://github.com/northpandalabs)**. Source available — see LICENSE.

---

## Downloads

> Always get the latest stable build from the **[Releases page](https://github.com/northpandalabs/Thought-Tidy/releases/latest)**.

| Platform | File |
| --- | --- |
| Chrome Extension | `thought-tidy-chrome.zip` — load unpacked in Chrome |
| Firefox Extension | `thought-tidy-firefox.zip` — load as temporary add-on or submit to AMO |
| Windows Desktop | `Thought Tidy Setup x.x.x.exe` — NSIS installer |
| macOS Desktop | `Thought Tidy-x.x.x.dmg` — drag-to-Applications |
| Linux Desktop | `thought-tidy_x.x.x_amd64.deb` or `Thought Tidy-x.x.x.AppImage` |

> **CI test builds** — every push to `main` also produces a TEST ONLY Windows portable `.exe` (no installer) available as a GitHub Actions artifact. Test builds display **⚠ TEST ONLY** banners in the settings page and tray menu — they are not stable releases.

---

## Free vs Pro

Thought Tidy has a **free tier** that works immediately with your own API key, and an optional **one-time Pro upgrade** from [North Panda Labs](https://northpandalabs.gumroad.com/l/thought-tidy).

| Feature | Free | Pro |
| --- | --- | --- |
| Fix Spelling & Grammar | ✓ | ✓ |
| Make Professional | ✓ | ✓ |
| Sound Human | ✓ | ✓ |
| Brain Dump → Clear Text | ✓ | ✓ |
| Today's activity history | ✓ | ✓ |
| Reorder built-in actions | ✓ | ✓ |
| 1 custom prompt | ✓ | ✓ |
| Sound Like Me (Your Profile) | — | ✓ |
| Improve Writing | — | ✓ |
| Make Formal / Casual | — | ✓ |
| Shorten / Expand | — | ✓ |
| Unlimited custom prompts | — | ✓ |
| Full history (all time) | — | ✓ |
| Multi-provider fallback | — | ✓ |
| Ollama (local AI, zero API cost) | — | ✓ |

Google Gemini has a free API tier — you can use the free tier of Thought Tidy at **zero cost**.

---

## Two versions — one codebase

| | Browser Extension | Desktop App |
| --- | --- | --- |
| **Works in** | Chrome, Firefox, Edge | Windows, macOS, Linux |
| **Trigger** | Right-click selected text | `Ctrl+Shift+Space` anywhere, system tray |
| **Quick actions** | Right-click menu | Tray → Quick Fix (Clipboard) — silent, notifies when done |
| **Source folder** | root (`manifest.json`, `background.js`…) | `desktop/` |
| **Build** | `npm run build` | `cd desktop && npm run dist` |
| **Run locally** | Load unpacked / temporary add-on | `cd desktop && npm start` |

Both share the same `lib/` folder — `api.js`, `prompts.js`, `models.js`, `text.js` — zero duplication.

The desktop app also syncs with the browser extension — enable **Desktop Sync** in settings to share your profile and custom prompts across both.

---

## Why this exists

Grammarly underlines your typos. That's useful. But it won't:

- Turn your scattered brain dump into a clear email
- Rewrite something in *your specific voice*
- Know that you work in roofing and write to homeowners who aren't technical
- Let you build your own custom actions
- Keep your writing completely private
- Cost you nothing per month

This does all of that. The gap isn't grammar checking — it's that no tool treats you as a *specific person* with a *specific voice* trying to communicate with *specific people*.

---

## What it does

Right-click any selected text on any webpage:

| Action | What it actually does |
| --- | --- |
| **👤 Sound Like Me** | Rewrites in *your* voice using your saved profile — not generic AI, not formal, just you but clear *(Pro)* |
| **✓ Fix Spelling & Grammar** | Cleans up mistakes without changing anything else |
| **★ Make Professional** | Full grammar fix + ensures your full meaning comes through — sounds confident and articulate |
| **💬 Sound Human** | Takes stiff or AI-sounding text and makes it feel like a real person wrote it |
| **🧠 Brain Dump → Clear Text** | You vomit your thoughts, it organizes everything into clean readable text without losing a word |
| **↑ Improve Writing** | Better clarity and flow, keeps your voice *(Pro)* |
| Make Formal / Casual | Shift the tone either direction *(Pro)* |
| Shorten / Expand | Adjust the length *(Pro)* |
| **⚡ Your Custom Prompts** | 1 free, unlimited with Pro — Email Reply, Slack Message, LinkedIn Post, anything |

---

## The "Sound Like Me" difference

This is the Pro feature that makes it personal instead of generic.

In Settings, fill out your profile:

- **Your name** — what you go by
- **Your role** — roofing contractor, developer, student, whatever
- **Your writing style** — "I write casually. Short sentences. Say 'gonna'. Use em-dashes."
- **Personal context** — your company, who you write to, common topics, anything the AI should know

Enable "Inject into every prompt" and every action now knows who you are. The output stops being ChatGPT and starts being *you, cleaned up*.

You can even maintain your context as a plain text file on GitHub Gist or your own site and load it with one click — the lightweight equivalent of what [Model Context Protocol](https://modelcontextprotocol.io) does for AI tools.

---

## vs. Grammarly

They're not the same tool. Grammarly corrects as you type. This rewrites on demand.

| | Grammarly | Thought Tidy |
| --- | --- | --- |
| Corrects as you type | ✓ | — |
| Rewrites whole passages | limited | ✓ |
| Knows who YOU are | — | ✓ Pro (Your Profile) |
| Brain dump → organized text | — | ✓ |
| Custom prompt actions | — | ✓ (1 free, unlimited Pro) |
| Works on any webpage | ✓ | ✓ |
| Privacy | their servers | your provider only |
| Monthly cost | $12–15/mo | fractions of a cent per fix |
| Source available | — | ✓ |
| Your data | stored by Grammarly | goes only to Claude/OpenAI/Gemini |

Use Grammarly for inline typo correction if you want it. Use this for everything else.

---

## How it works

1. You highlight text and right-click → pick an action
2. The extension sends your text + a system prompt directly to your chosen AI provider
3. A modal shows original vs. suggested text side by side (with word count)
4. Click **Replace Selected** or **Copy** — done

No Thought Tidy servers. No analytics. No accounts. Your text goes from your browser to the AI provider you chose and nowhere else. The extension is ~10 files of plain HTML/CSS/JS with a small build step to produce browser-specific packages.

---

## Browser extension — install locally

### Prerequisites

```bash
npm install        # installs webextension-polyfill
npm run build      # builds dist/chrome/ and dist/firefox/
```

Or one target at a time: `npm run build:chrome` / `npm run build:firefox`

### Chrome / Edge

1. Run `npm run build:chrome` — output lands in `dist/chrome/`
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode** → click **Load unpacked** → select `dist/chrome/`
4. Click the toolbar button → **Open Full Settings** → paste your API key → **Save**

### Firefox

1. Run `npm run build:firefox` — output lands in `dist/firefox/`
2. Open Firefox → `about:debugging` → **This Firefox** → **Load Temporary Add-on…**
3. Select any file inside `dist/firefox/` (e.g. `manifest.json`)
4. Click the toolbar button → **Open Full Settings** → paste your API key → **Save**

> Firefox temporary add-ons are removed on restart. Publish to AMO or self-sign with [web-ext](https://github.com/mozilla/web-ext) to make it permanent.

---

## Desktop app — install locally

The desktop app is a standalone tray application — no browser required.

### Setup

```bash
cd desktop
npm install
```

### Run in development

```bash
cd desktop
npm start          # launches with DevTools open
```

On first launch the Settings window opens automatically. Paste one API key, press **Enter** to test it, then close Settings. From then on:

- **`Ctrl+Shift+Space`** (or `Cmd+Shift+Space` on Mac) opens the popup from anywhere
- **Right-click the tray icon** for quick clipboard actions (processes silently, notifies when done)

### Build distributable installers

```bash
cd desktop
npm run dist:win     # → dist-build/*.exe  (Windows NSIS installer)
npm run dist:mac     # → dist-build/*.dmg  (macOS disk image)
npm run dist:linux   # → dist-build/*.AppImage
```

Or just `npm run dist` to build for the current platform.

### Install from the Windows installer

1. Run `npm run dist:win` — output is `dist-build/Thought Tidy Setup 1.4.6.exe`
2. Double-click the `.exe` → choose an install directory → click **Install**
3. A shortcut is added to your Desktop and Start Menu
4. The app starts in the system tray automatically

To uninstall: **Settings → Apps → Thought Tidy → Uninstall**, or use the uninstaller in the install folder.

### Auto-updates

The installed app checks for updates on launch and every 4 hours. When a new version is available:

1. It downloads silently in the background
2. A notification appears: *"Version X.Y.Z downloading…"*
3. When the download finishes, a dialog asks if you want to restart now or later
4. On restart, the new version installs automatically

**Releasing a new version:**

1. Bump `version` in `desktop/package.json` and the root `manifest.json`
2. Run `npm run release` from the `desktop/` folder — this builds the installer and uploads it to GitHub Releases
3. Existing installs will pick up the update within 4 hours

> `npm run release` requires a `GH_TOKEN` environment variable set to a GitHub personal access token with `repo` scope.

---

## Publish to extension stores

### Chrome Web Store

1. Run `npm run build:chrome`

2. Zip the `dist/chrome/` folder:

   ```bash
   # Windows PowerShell
   Compress-Archive -Path dist/chrome/* -DestinationPath thought-tidy-chrome.zip

   # macOS / Linux
   cd dist/chrome && zip -r ../../thought-tidy-chrome.zip . && cd ../..
   ```

3. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
4. Sign in with a Google account — one-time $5 developer registration fee
5. Click **New Item** → upload `thought-tidy-chrome.zip`
6. Fill out the store listing (name, description, screenshots, category: **Productivity**)
7. Submit for review — Chrome reviews usually take 1–3 business days
8. Once approved, the extension goes live at your store URL

### Firefox Add-ons (AMO)

1. Run `npm run build:firefox`

2. Zip the `dist/firefox/` folder:

   ```bash
   # Windows PowerShell
   Compress-Archive -Path dist/firefox/* -DestinationPath thought-tidy-firefox.zip

   # macOS / Linux
   cd dist/firefox && zip -r ../../thought-tidy-firefox.zip . && cd ../..
   ```

3. Go to [addons.mozilla.org/developers](https://addons.mozilla.org/developers/) and sign in / create an account (free)
4. Click **Submit a New Add-on** → **On this site** → upload `thought-tidy-firefox.zip`
5. **Source code question:** Mozilla asks if you use code generators, minifiers, or bundlers. Answer **No** — the build script (`scripts/build.js`) only copies plain JS/CSS/HTML files and adjusts the manifest. No minification, no webpack, no transpilation. Reviewers can read the submitted files directly.
6. Fill out the listing (name, description, screenshots, category: **Writing**)
7. Submit for review — AMO reviews typically take a few days for new add-ons; faster after the first
8. Once approved, the add-on is live on AMO and installable with one click

> The add-on ID in `browser_specific_settings.gecko.id` (set in `manifest.json`) must match the ID you registered on AMO. This is copied automatically by `scripts/build.js`.

### Versioning

Before uploading, bump the `version` field in both `package.json` and `manifest.json` to match (e.g. `"1.4.6"`). Both stores reject re-uploads of the same version number.

---

## Get an API key

You need a key from **one** of these. All have free tiers or cheap starting costs.

| Provider | Get your key | Cheapest model | Free tier |
| --- | --- | --- | --- |
| **OpenAI** | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | gpt-4o-mini (~$0.00015/1K tokens) | No, but cheap |
| **Anthropic (Claude)** | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) | claude-haiku-4-5 | No, but cheap |
| **Google Gemini** | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) | gemini-2.5-flash-lite | **Yes** |

A typical "Fix Spelling" on a paragraph costs less than $0.001. You'd spend $1 on thousands of fixes.

---

## For developers

No bundler. No framework. Minimal build step (just copies files + swaps the manifest background section per browser).

```text
manifest.json         ← source manifest (MV3, service_worker — Chrome base)
background.js         ← context menu wiring + API dispatch (MV3 service worker)
content.js            ← result modal injected into pages
content.css           ← modal styling
lib/
  api.js              ← provider API calls (OpenAI, Anthropic, Gemini, Ollama)
  models.js           ← model lists per provider
  prompts.js          ← system prompts + profile injection
  text.js             ← text utilities (shared with content script)
popup/                ← toolbar button popup (quick provider/variant switch)
options/              ← full settings page (keys, models, profile, custom prompts)
scripts/
  build.js            ← produces dist/chrome/ and dist/firefox/
  setup.js            ← first-run setup helper
  loadEnv.js          ← Jest globalSetup — loads .env for live API tests
tests/                ← Jest unit + integration tests for lib/ (~350 tests)
desktop/
  main.js             ← Electron main process
  renderer/           ← settings UI (HTML/CSS/JS)
  lib-node/           ← Node-only code (updater, store)
  tests/              ← Jest tests for desktop-specific code (~90 tests)
dist/
  chrome/             ← built Chrome extension (load unpacked here)
  firefox/            ← built Firefox extension (load temporary add-on here)
```

### Running tests

```bash
npm test                    # extension tests (unit + live API if keys present)
npm test -- --coverage      # with coverage report
cd desktop && npm test      # desktop tests
cd desktop && npm test -- --coverage  # desktop with coverage report
```

Live API tests in `tests/utilization.test.js` require env vars to run — they skip gracefully when absent:

```bash
# .env at project root (gitignored — never commit this file)
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AIza...
CLAUDE_API_KEY=sk-ant-...
```

### Code coverage

Coverage is measured per suite and reported in the GitHub Release notes for every tagged release.

| Suite | Command | Output |
| --- | --- | --- |
| Extension (`tests/`) | `npm test -- --coverage` | `coverage/lcov-report/index.html` |
| Desktop (`desktop/tests/`) | `cd desktop && npm test -- --coverage` | `desktop/coverage/lcov-report/index.html` |

Both suites must pass in CI before any release is tagged. Coverage thresholds are enforced in Jest config — a drop below the threshold fails the build.

### Security

Thought Tidy has no backend server. All security concerns are client-side. The `tests/security.test.js` file covers the key invariants:

| Area | What is tested |
| --- | --- |
| **XSS prevention** | All user-supplied text rendered via `textContent` or `escHtml()` — never `innerHTML`. Modal injection verified to escape special characters. |
| **API key storage** | Extension stores keys via AES-256-GCM (`lib/crypto-storage.js`). Desktop uses OS keychain (`electron.safeStorage` / DPAPI on Windows). Keys are never logged or included in error messages. |
| **Context isolation** | Electron `BrowserWindow` enforces `contextIsolation: true` and `nodeIntegration: false`. Preload script (`preload.js`) exposes only the minimum IPC surface. |
| **Content Security Policy** | Extension manifest defines a strict CSP. No inline scripts, no `eval`. |
| **No PII leakage** | No analytics, no telemetry. Text goes only from the browser to the AI provider the user configured — nowhere else. |
| **Sync token auth** | Desktop sync server (127.0.0.1:47391) requires a session token generated at startup. Cross-process access is rejected. |

If all tests fail in CI, the build is blocked and no release artifact is produced. Security test failures are treated as Critical — they must be remediated before any merge to `main`.

**Build output differences (Chrome vs Firefox):**

| | Chrome (`dist/chrome/`) | Firefox (`dist/firefox/`) |
| --- | --- | --- |
| `background` in manifest | `"service_worker": "background.js"` | `"scripts": [...]` array |
| `importScripts()` in background.js | kept | stripped (deps in manifest instead) |
| `browser_specific_settings` | removed | `gecko.id` added |

**Things worth building:**

- Keyboard shortcut to trigger last-used action
- Writing history (last N fixes, restorable)
- More providers (Mistral, Cohere)
- Right-click on images → describe / alt-text generation
- A real MCP server integration for Claude Desktop users

PRs, issues, and forks are all welcome.

---

## FAQ

**Does Thought Tidy work on Chrome and Firefox?**  
Yes. Run `npm run build` to produce `dist/chrome/` (Manifest V3, service worker) and `dist/firefox/` (Manifest V3, background scripts array). Both are ready to load or submit to their respective stores.

**Why do I need my own API key?**  
Your writing is private. The extension talks directly from your browser to the AI provider (OpenAI, Anthropic, or Google). There are no Thought Tidy servers, no accounts, and nothing stored except your settings (locally, in browser storage).

**Which AI provider should I pick?**  
Google Gemini has a free tier — good starting point. OpenAI gpt-4o-mini and Anthropic claude-haiku are both very cheap and fast. Claude tends to preserve voice better; GPT tends to be slightly more grammatically conservative.

**How much does it cost to use?**  
Fractions of a cent per action. Fixing a paragraph of text costs roughly $0.0003–$0.001 depending on the model. Most users spend under $1/month with heavy use.

**Is my writing stored anywhere?**  
No. Text goes from your browser to the AI provider you chose (OpenAI/Anthropic/Google) and nowhere else. The extension has no backend. Your API key and settings are stored locally in your browser using the standard `browser.storage.local` API.

**I get "background.service_worker is currently disabled" in Firefox.**  
You're loading the Chrome build in Firefox. Use `npm run build:firefox` and load `dist/firefox/` instead. Firefox MV3 uses `background.scripts` rather than a service worker.

**Can I use this without publishing to a store?**  
Yes. Chrome: load `dist/chrome/` as an unpacked extension (stays loaded until you remove it). Firefox: load `dist/firefox/` as a temporary add-on (removed on browser restart — or self-sign with web-ext).

**How do I add my own actions?**  
Open the extension settings → scroll to **Custom Prompts** → add a name and a system prompt. Your custom action appears in the right-click menu. Free users get 1 custom prompt; Pro unlocks unlimited.

**What is "Sound Like Me"?**  
A Pro profile system where you describe yourself — your name, role, writing style, and any context the AI should know. When enabled, every action uses your profile as context, so the output matches your voice instead of sounding like generic AI.

**Does it work on every website?**  
It injects into all pages (`<all_urls>` content script). It works anywhere you can select text and right-click. Some sites with aggressive CSP or sandboxed iframes may block the modal injection — the right-click menu still appears, but the result won't display inline.

**Can I contribute?**  
Yes — PRs, issues, and forks are welcome. The codebase is plain HTML/CSS/JS with no framework. Run `npm test` before submitting a PR.

---

## Built by

**North Panda Labs** — [github.com/northpandalabs](https://github.com/northpandalabs)

Built because we needed it. Source available under the project LICENSE.

---

## License

Source available — see LICENSE. Not open source.
