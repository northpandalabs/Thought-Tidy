# Blur-to-Clear — Desktop App Plan

This document outlines how to ship Blur-to-Clear as a standalone desktop application using Node.js, so it works outside a browser entirely.

---

## Is it possible?

Yes. The extension is already ~90% plain JavaScript with no browser-extension-specific APIs in the core logic (`lib/`). The main things that are extension-specific are:

- `browser.contextMenus` — OS right-click menu integration
- `browser.storage.local` — settings persistence
- `browser.tabs.sendMessage` — injecting the result modal into a webpage
- `browser.runtime.onInstalled` — first-run setup

All of these have Node/Electron equivalents. The AI provider calls (`lib/api.js`) are plain `fetch` and work identically in Node 18+.

---

## Architecture options

### Option A — Electron app (recommended for desktop GUI)

**What it is:** Chromium + Node.js bundled into a native `.exe`/`.app`/`.deb`.

**How it would work:**
1. A system tray icon replaces the toolbar button
2. Clicking the tray icon opens a small Electron window (the same popup HTML, mostly unchanged)
3. A global hotkey (e.g. `Ctrl+Shift+Space`) captures the current clipboard or selected text and opens the window with it pre-filled
4. `electron-store` replaces `browser.storage.local` for settings persistence
5. The result is copied to clipboard or shown in a floating window — no page injection needed

**Key packages:**
- `electron` — the framework
- `electron-store` — settings (drop-in replacement for `browser.storage.local`)
- `electron-globalshortcut` — global hotkey to trigger from any app
- `@electron/remote` — optional, for IPC between main and renderer
- `electron-builder` — packages into `.exe`, `.dmg`, `.AppImage`

**Migration effort:**
- `lib/api.js`, `lib/models.js`, `lib/prompts.js`, `lib/text.js` — zero changes
- `popup/` HTML/CSS — ~10% changes (swap `browser.storage.local` → `electron-store` calls via IPC)
- `options/` HTML/CSS — ~10% changes (same swap)
- `background.js` — rewrite as Electron main process (`main.js`); context menu via `Menu`/`globalShortcut`
- `content.js` — not needed; result goes to clipboard or an Electron window instead

**Rough folder structure:**
```
blur-to-clear-desktop/
  main.js              ← Electron main process (replaces background.js)
  preload.js           ← exposes safe IPC bridge to renderer
  renderer/
    popup.html         ← same as extension popup (minor tweaks)
    popup.css
    popup.js
  settings/
    options.html       ← same as extension options (minor tweaks)
    options.css
    options.js
  lib/                 ← identical to extension lib/
  package.json
  electron-builder.yml ← build config for .exe/.dmg/.AppImage
```

---

### Option B — CLI tool (fastest to build)

**What it is:** A `npx blur-to-clear` command that takes text from stdin or a file, runs it through an AI action, and returns the result to stdout.

**Usage:**
```bash
echo "i wrote this reel quick" | npx blur-to-clear --action fix-spelling
pbpaste | npx blur-to-clear --action professional | pbcopy
```

**How it would work:**
- Pure Node.js, no Electron
- `lib/api.js` needs one tweak: replace `fetch` with Node's native `fetch` (Node 18+) — already compatible
- Settings stored in `~/.config/blur-to-clear/config.json` via `os.homedir()`
- First run: `npx blur-to-clear --setup` prompts for API key and provider interactively

**Key packages:**
- `commander` or `yargs` — CLI argument parsing
- No other dependencies needed (Node 18+ has native fetch)

**Migration effort:** Low. Mostly a thin CLI wrapper around `lib/api.js` and `lib/prompts.js`.

---

### Option C — Menu bar app (macOS / Windows tray)

**What it is:** Like Option A (Electron) but with no dock icon — lives entirely in the system tray/menu bar.

- macOS: appears in the menu bar at the top
- Windows: appears in the system tray (bottom right)

This is the most "native-feeling" approach for power users. Build with Electron + `app.dock.hide()` on macOS and `Tray` API on both platforms.

---

## Recommended path

1. **Start with the CLI** (Option B) — lowest effort, proves the core logic works outside a browser, useful for power users and CI pipelines.
2. **Then build the Electron tray app** (Option A/C) — reuses the same HTML/CSS/JS UI from the extension with minimal changes.

---

## Shared code strategy

The `lib/` folder is already isolated with `if (typeof module !== "undefined") module.exports = ...` guards. This means:

- The browser extension loads them as plain `<script>` tags
- A Node/Electron app imports them with `require()` or `import`
- No duplication needed — one codebase, two targets

---

## Global hotkey flow (Electron)

```
User presses Ctrl+Shift+Space
  → Electron reads clipboard (or OS selected text via robotjs)
  → Opens popup window with text pre-filled
  → User picks action → clicks Process
  → Result shown in popup + auto-copied to clipboard
  → User presses Ctrl+V to paste anywhere
```

The "no right-click needed" experience is actually better than the extension for heavy users.

---

## Build and distribute

```bash
# Development
npm start             # opens Electron with DevTools

# Package
npm run dist          # electron-builder → dist/
# outputs:
#   Blur-to-Clear-Setup-1.x.x.exe   (Windows NSIS installer)
#   Blur-to-Clear-1.x.x.dmg         (macOS disk image)
#   Blur-to-Clear-1.x.x.AppImage    (Linux portable)
```

Auto-update via `electron-updater` pointing at GitHub Releases — when a new version tag is pushed, the app checks and offers to update itself.

---

## Timeline estimate

| Phase | Effort |
| --- | --- |
| CLI tool (Option B) | 1–2 days |
| Electron shell + tray icon | 2–3 days |
| Port popup/options UI to Electron renderer | 1–2 days |
| Packaging + auto-update | 1 day |
| **Total** | **~1 week** |

The bulk of the work is already done — the AI logic, the UI, and the settings system exist. The port is mostly replacing `browser.*` API calls with their Electron equivalents.
