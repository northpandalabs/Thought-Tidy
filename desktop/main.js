// main.js — Blur-to-Clear desktop app (Electron main process)
// Tray icon + global hotkey + popup + settings windows

const {
  app, BrowserWindow, Tray, Menu, globalShortcut,
  ipcMain, clipboard, nativeImage, shell, Notification, screen,
  dialog
} = require("electron");
const path  = require("path");
const Store = require("electron-store");
const { registerAll } = require("./ipc-handlers");
const { todayDate, purgeOldLog } = require("../lib/text");

const store = new Store({ name: "blur-to-clear-settings" });
const isDev = process.argv.includes("--dev");

// True when built with testBuild:true injected via electron-builder-test.yml.
// Drives TEST ONLY banners in settings UI and tray menu label.
const IS_TEST_BUILD = (() => {
  if (!app.isPackaged) return process.env.TEST_BUILD === 'true';
  try { return require('./package.json').testBuild === true; } catch { return false; }
})();

let tray        = null;
let popupWin    = null;
let settingsWin = null;

// ── Path helpers ───────────────────────────────────────────────────────────────

// In production (packaged), extra resources land in process.resourcesPath.
// In development they live relative to this file.
function rootPath(...parts) {
  return app.isPackaged
    ? path.join(process.resourcesPath, ...parts)
    : path.join(__dirname, "..", ...parts);
}

// ── Popup window ───────────────────────────────────────────────────────────────

function createPopup() {
  popupWin = new BrowserWindow({
    width:     360,
    height:    660,
    show:      false,
    frame:     false,
    resizable: false,
    movable:   true,
    alwaysOnTop: true,
    skipTaskbar: true,
    roundedCorners: true,
    webPreferences: {
      preload:          path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration:  false
    }
  });

  popupWin.loadFile(path.join(__dirname, "renderer", "popup.html"));

  // Hide (don't close) when focus is lost
  popupWin.on("blur", () => {
    if (!isDev) popupWin.hide();
  });

  popupWin.on("closed", () => { popupWin = null; });

  if (isDev) popupWin.webContents.openDevTools({ mode: "detach" });
}

function openPopup() {
  if (!popupWin || popupWin.isDestroyed()) createPopup();

  // Position: bottom-right of the primary display work area
  const { workAreaSize } = screen.getPrimaryDisplay();
  const [w, h] = [360, 660];
  popupWin.setBounds({
    x: workAreaSize.width  - w - 16,
    y: workAreaSize.height - h - 16,
    width: w, height: h
  });

  popupWin.show();
  popupWin.focus();
  // Tell the renderer to pre-fill clipboard
  popupWin.webContents.send("popup-opened");
}

// ── History window ─────────────────────────────────────────────────────────────

let historyWin = null;

function openHistory() {
  if (historyWin && !historyWin.isDestroyed()) { historyWin.focus(); return; }
  historyWin = new BrowserWindow({
    width:    860,
    height:   700,
    minWidth: 600,
    title:    "Blur-to-Clear — History",
    webPreferences: {
      preload:          path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration:  false
    }
  });
  historyWin.setMenu(null);
  historyWin.loadFile(path.join(__dirname, "renderer", "history.html"));
  historyWin.on("closed", () => { historyWin = null; });
}

// ── Settings window ────────────────────────────────────────────────────────────

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width:    780,
    height:   720,
    minWidth: 600,
    title:    "Blur-to-Clear — Settings",
    webPreferences: {
      preload:          path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration:  false
    }
  });
  settingsWin.setMenu(null);
  settingsWin.loadFile(path.join(__dirname, "renderer", "settings.html"));
  settingsWin.on("closed", () => { settingsWin = null; });

  if (isDev) settingsWin.webContents.openDevTools({ mode: "right" });
}

// ── Tray ───────────────────────────────────────────────────────────────────────

function buildTrayMenu() {
  const { DEFAULT_ACTION_SETTINGS, resolveActionSettings } = require("../lib/prompts");
  const storedActions  = resolveActionSettings(store.get("actionSettings") || []);
  const enabledActions = storedActions.filter(a => a.enabled);
  const customPrompts  = store.get("customPrompts") || [];

  const quickItems = enabledActions.map(a => ({
    label: a.label,
    click: () => quickAction(a.id, a.label)
  }));
  if (customPrompts.length) {
    quickItems.push({ type: "separator" });
    customPrompts.slice(0, 8).forEach((cp, i) => {
      quickItems.push({ label: `⚡ ${cp.name}`, click: () => quickCustomAction(i) });
    });
  }

  const items = [];
  if (IS_TEST_BUILD) {
    items.push({ label: "── TEST ONLY ──", enabled: false });
    items.push({ type: "separator" });
  }
  items.push(
    { label: "Process Text…",          click: openPopup },
    { type:  "separator" },
    { label: "Quick Fix (Clipboard)",  submenu: quickItems },
    { type:  "separator" },
    { label: "📋 See History",         click: openHistory },
    { type:  "separator" },
    { label: "Settings…",              click: openSettings },
    { type:  "separator" },
    { label: "Quit Blur-to-Clear",     role: "quit" }
  );
  return Menu.buildFromTemplate(items);
}

async function quickAction(action) {
  const text = clipboard.readText().trim();
  if (!text) {
    new Notification({ title: "Blur-to-Clear", body: "Clipboard is empty." }).show();
    return;
  }

  try {
    const { MENU_PROMPTS, buildPromptWithProfile } = require("./lib-node/prompts");
    const { callAIWithFallback }                   = require("./lib-node/api");
    const { estimateCost }                         = require("../lib/pricing");
    const s = store.store;
    const systemPrompt = buildPromptWithProfile(MENU_PROMPTS[action] || MENU_PROMPTS["fix-spelling"], s);
    const { result, usedProvider, usedModel } = await callAIWithFallback(
      s.configuredProviders || [], s.geminiModels || [null, null, null], s, systemPrompt, text
    );
    clipboard.writeText(result);
    store.set("lastAction", action);

    const today = todayDate();
    const fresh = purgeOldLog(store.get("historyLog") || []);
    fresh.push({
      timestamp: Date.now(), date: today, source: "desktop",
      action, provider: usedProvider, model: usedModel,
      inputLen: text.length, outputLen: result.length
    });
    store.set("historyLog", fresh.slice(-200));

    const historyFull = store.get("historyFull") || [];
    const cost = estimateCost(usedModel, text, [result]);
    historyFull.push({
      id: Math.random().toString(36).slice(2, 9),
      timestamp: Date.now(), date: today, source: "desktop",
      action, provider: usedProvider, model: usedModel,
      inputText: text.slice(0, 5000),
      outputs: [result.slice(0, 5000)],
      ...cost
    });
    store.set("historyFull", historyFull.slice(-500));

    updateTrayTooltip();
    new Notification({ title: "Blur-to-Clear", body: "Done — result copied to clipboard." }).show();
  } catch (err) {
    new Notification({ title: "Blur-to-Clear — Error", body: err.message }).show();
  }
}

async function quickCustomAction(idx) {
  const text = clipboard.readText().trim();
  if (!text) { new Notification({ title: "Blur-to-Clear", body: "Clipboard is empty." }).show(); return; }
  try {
    const { buildPromptWithProfile } = require("./lib-node/prompts");
    const { callAIWithFallback }     = require("./lib-node/api");
    const { estimateCost }           = require("../lib/pricing");
    const s         = store.store;
    const cp        = (s.customPrompts || [])[idx];
    if (!cp) return;
    const systemPrompt = buildPromptWithProfile(cp.prompt, s);
    const { result, usedProvider, usedModel } = await callAIWithFallback(
      s.configuredProviders || [], s.geminiModels || [null, null, null], s, systemPrompt, text
    );
    clipboard.writeText(result);
    store.set("lastAction", `custom-${idx}`);

    const today = todayDate();
    const fresh = purgeOldLog(store.get("historyLog") || []);
    fresh.push({
      timestamp: Date.now(), date: today, source: "desktop",
      action: `custom-${idx}`, provider: usedProvider, model: usedModel,
      inputLen: text.length, outputLen: result.length
    });
    store.set("historyLog", fresh.slice(-200));

    const historyFull = store.get("historyFull") || [];
    const cost = estimateCost(usedModel, text, [result]);
    historyFull.push({
      id: Math.random().toString(36).slice(2, 9),
      timestamp: Date.now(), date: today, source: "desktop",
      action: `custom-${idx}`, provider: usedProvider, model: usedModel,
      inputText: text.slice(0, 5000), outputs: [result.slice(0, 5000)], ...cost
    });
    store.set("historyFull", historyFull.slice(-500));

    updateTrayTooltip();
    new Notification({ title: "Blur-to-Clear", body: "Done — result copied to clipboard." }).show();
  } catch (err) {
    new Notification({ title: "Blur-to-Clear — Error", body: err.message }).show();
  }
}

function updateTrayTooltip() {
  if (!tray) return;
  const count = purgeOldLog(store.get("historyLog") || []).length;
  tray.setToolTip(count > 0 ? `Blur-to-Clear · ${count} fix${count === 1 ? "" : "es"} today` : "Blur-to-Clear");
}

function createTray() {
  let icon;
  // Windows requires PNG or ICO for tray icons — SVG is not supported
  const pngPath = rootPath("icons", "icon.png");

  try {
    icon = nativeImage.createFromPath(pngPath);
    if (icon.isEmpty()) throw new Error("empty");
    icon = icon.resize({ width: 22, height: 22 });
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip("Blur-to-Clear");
  tray.setContextMenu(buildTrayMenu());

  // Left-click / primary click opens the popup
  tray.on("click",        openPopup);
  tray.on("double-click", openPopup);
}

// ── Smart shortcut routing ─────────────────────────────────────────────────────
// Browsers capture Ctrl+Shift+Space for the extension shortcut at the browser level,
// but Electron's globalShortcut is an OS-level hook that fires regardless of which
// app has focus. This helper detects the foreground process and skips the desktop
// popup when a browser is in front, letting the extension handle it instead.

const BROWSER_PROCS = new Set([
  "chrome", "msedge", "firefox", "brave", "opera", "vivaldi", "chromium", "browser"
]);

function getBrowserAwareForegroundProcess(cb) {
  const { exec } = require("child_process");
  if (process.platform === "win32") {
    // Use PowerShell to resolve foreground window → process name via Win32 API
    const cmd =
      "powershell -NoProfile -NonInteractive -WindowStyle Hidden -Command " +
      "\"$t=Add-Type -MemberDefinition '[DllImport(`\"user32.dll`\")] public static extern IntPtr GetForegroundWindow();" +
      "[DllImport(`\"user32.dll`\")] public static extern int GetWindowThreadProcessId(IntPtr h, out int p);'" +
      " -Name W -Namespace W -PassThru;" +
      "$p=0;$t::GetWindowThreadProcessId($t::GetForegroundWindow(),[ref]$p)|Out-Null;" +
      "(Get-Process -Id $p -ErrorAction SilentlyContinue).ProcessName\"";
    exec(cmd, { timeout: 900, windowsHide: true }, (err, stdout) => {
      cb(err ? null : (stdout || "").trim().toLowerCase());
    });
  } else if (process.platform === "darwin") {
    exec(
      "osascript -e 'tell application \"System Events\" to name of first application process whose frontmost is true'",
      { timeout: 800 },
      (err, stdout) => {
        cb(err ? null : (stdout || "").trim().toLowerCase());
      }
    );
  } else {
    cb(null); // Linux: no subprocess check, always open popup
  }
}

function smartOpenPopup() {
  // If the popup is already shown and focused, treat shortcut as toggle-close
  if (popupWin && !popupWin.isDestroyed() && popupWin.isVisible() && popupWin.isFocused()) {
    popupWin.hide();
    return;
  }
  // If any Electron window has focus, skip (settings or history window is active)
  if (app.getFocusedWindow()) return;

  getBrowserAwareForegroundProcess(procName => {
    if (procName && BROWSER_PROCS.has(procName)) return; // browser extension handles it
    openPopup();
  });
}

// ── App lifecycle ──────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  app.setName("Blur-to-Clear");

  registerAll(ipcMain, {
    store,
    clipboard,
    openSettings,
    openHistory,
    closePopup: () => { if (popupWin) popupWin.hide(); },
    openURL:    (url) => shell.openExternal(url)
  });

  ipcMain.handle("get-app-config", () => ({
    isTestBuild:     IS_TEST_BUILD,
    updateAvailable: store.get("updateAvailable") || null
  }));

  ipcMain.handle("quick-action", async (_, { action, text }) => {
    const { MENU_PROMPTS, buildPromptWithProfile } = require("./lib-node/prompts");
    const { callAI }                               = require("./lib-node/api");
    const s            = store.store;
    const provider     = s.provider || "openai";
    const systemPrompt = buildPromptWithProfile(MENU_PROMPTS[action] || MENU_PROMPTS["fix-spelling"], s);
    return callAI(provider, s, systemPrompt, text);
  });

  // macOS: no dock icon — pure tray app
  if (process.platform === "darwin") app.dock.hide();

  createTray();
  updateTrayTooltip();
  // Purge stale log entries from previous days on launch
  store.set("historyLog", purgeOldLog(store.get("historyLog") || []));

  // Global shortcut: Ctrl+Shift+Space  (Cmd+Shift+Space on Mac)
  const shortcut = process.platform === "darwin"
    ? "Command+Shift+Space"
    : "Control+Shift+Space";

  const registered = globalShortcut.register(shortcut, smartOpenPopup);
  if (!registered && isDev) console.warn("Global shortcut registration failed.");

  // First run: open settings if no API key saved yet
  const hasKey = store.get("openaiKey") || store.get("claudeKey") || store.get("geminiKey");
  if (!hasKey) {
    openSettings();
  }

  // Schedule passive update check (packaged builds only — checks at noon daily)
  if (app.isPackaged) {
    const { scheduleUpdateCheck } = require("./lib-node/updater");
    scheduleUpdateCheck(store);
  }
});


// Keep process alive after all windows close (tray app — stays in background)
app.on("window-all-closed", () => {});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
