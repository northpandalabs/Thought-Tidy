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
  return Menu.buildFromTemplate([
    { label: "Process Text…",     click: openPopup },
    { type:  "separator" },
    {
      label: "Quick Fix (Clipboard)",
      submenu: [
        { label: "✓  Fix Spelling & Grammar",  click: () => quickAction("fix-spelling") },
        { label: "★  Make Professional",        click: () => quickAction("professional") },
        { label: "↑  Improve Writing",          click: () => quickAction("improve") },
        { label: "💬  Sound Human",              click: () => quickAction("sound-human") }
      ]
    },
    { type:  "separator" },
    { label: "Settings…",         click: openSettings },
    { type:  "separator" },
    { label: "Quit Blur-to-Clear", role: "quit" }
  ]);
}

async function quickAction(action) {
  const text = clipboard.readText().trim();
  if (!text) {
    new Notification({ title: "Blur-to-Clear", body: "Clipboard is empty." }).show();
    return;
  }

  try {
    const { MENU_PROMPTS, buildPromptWithProfile } = require("./lib-node/prompts");
    const { callAI }                               = require("./lib-node/api");
    const s            = store.store;
    const provider     = s.provider || "openai";
    const systemPrompt = buildPromptWithProfile(MENU_PROMPTS[action], s);
    const result       = await callAI(provider, s, systemPrompt, text);
    clipboard.writeText(result);
    store.set("lastAction", action);

    // Append history log entry (metadata only — no text stored)
    // s is already defined above as store.store
    const today = todayDate();
    const fresh = purgeOldLog(store.get("historyLog") || []);
    fresh.push({
      timestamp: Date.now(), date: today, source: "desktop",
      action, provider: s.provider || "openai",
      model: s[`${s.provider || "openai"}Model`] || "",
      inputLen: text.length, outputLen: result.length
    });
    store.set("historyLog", fresh.slice(-200));
    updateTrayTooltip();

    new Notification({
      title: "Blur-to-Clear",
      body:  "Done — result copied to clipboard."
    }).show();
  } catch (err) {
    new Notification({
      title: "Blur-to-Clear — Error",
      body:  err.message
    }).show();
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

// ── App lifecycle ──────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  app.setName("Blur-to-Clear");

  registerAll(ipcMain, {
    store,
    clipboard,
    openSettings,
    closePopup: () => { if (popupWin) popupWin.hide(); },
    openURL:    (url) => shell.openExternal(url)
  });

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

  const registered = globalShortcut.register(shortcut, openPopup);
  if (!registered && isDev) console.warn("Global shortcut registration failed.");

  // First run: open settings if no API key saved yet
  const hasKey = store.get("openaiKey") || store.get("claudeKey") || store.get("geminiKey");
  if (!hasKey) {
    openSettings();
  }

  setupAutoUpdater();
});

// ── Auto-updater ───────────────────────────────────────────────────────────────

function setupAutoUpdater() {
  if (!app.isPackaged) return; // only check for updates in production builds

  const { autoUpdater } = require("electron-updater");
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    new Notification({
      title: "Blur-to-Clear Update",
      body:  `Version ${info.version} is downloading in the background.`
    }).show();
  });

  autoUpdater.on("update-downloaded", () => {
    dialog.showMessageBox({
      type:    "info",
      title:   "Update Ready",
      message: "A new version has been downloaded. Restart now to apply the update?",
      buttons: ["Restart Now", "Later"]
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on("error", (err) => {
    if (isDev) console.error("Auto-updater error:", err.message);
  });

  // Check on launch, then every 4 hours
  autoUpdater.checkForUpdates();
  setInterval(() => autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1000);
}

// Keep process alive after all windows close (tray app — stays in background)
app.on("window-all-closed", () => {});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
