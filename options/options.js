// Extension settings shell — delegates shared logic to lib/shared-settings.js
/* global browser, cryptoGet, cryptoSet, syncWithDesktop, purgeOldLog, todayDate, isProUnlocked */

const STORAGE_KEYS = [
  "configuredProviders", "geminiModels",
  "provider", "openaiKey", "openaiModel", "openaiModels",
  "claudeKey", "claudeModel", "claudeModels",
  "geminiKey", "geminiModel", "geminiModels",
  "variants", "customPrompts", "actionSettings",
  "profileName", "profileRole", "profileStyle", "profileContext", "profileEnabled",
  "licenseEmail", "licenseKey", "syncEnabled", "contextPresets", "contextEnabled",
  "audienceLevel", "devMode", "themeMode", "historyPin", "grammarFilters"
];

window.platformOpenURL = url => browser.tabs.create({ url });
window.onProvidersSaved = () => syncWithDesktop().catch(() => {});
window.onProActivated   = () => syncWithDesktop().catch(() => {});
window.proActiveBtnText = "⚡ Pro Active — Manage ↓";

function triggerDownload(content, filename) {
  const blob = new Blob([content], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

window.platformSaveBackup = (content, filename) => { triggerDownload(content, filename); return Promise.resolve(); };
window.platformOpenBackup = () => new Promise((resolve) => {
  const input = document.createElement("input");
  input.type = "file"; input.accept = ".ttbackup"; input.style.display = "none";
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) { input.remove(); resolve(null); return; }
    const reader = new FileReader();
    reader.onload  = (ev) => { input.remove(); resolve(ev.target.result); };
    reader.onerror = ()   => { input.remove(); resolve(null); };
    reader.readAsText(file);
  };
  document.body.appendChild(input);
  input.click();
});
window.syncWithDesktopAfterImport = () => syncWithDesktop();

async function loadHistoryViewer() {
  const stored = await browser.storage.local.get(["historyLog", "licenseEmail", "licenseKey"]);
  const isPro    = isProUnlocked(stored);
  const entries  = isPro ? [...(stored.historyLog||[])] : purgeOldLog(stored.historyLog||[]);
  const section  = document.getElementById("history-viewer-section");
  if (!section) return;
  if (!entries.length) { section.style.display = "none"; return; }
  document.getElementById("history-viewer-count").textContent = entries.length;
  const list = document.getElementById("history-viewer-list");
  list.innerHTML = "";
  [...entries].reverse().forEach(e => {
    const t    = new Date(e.timestamp);
    const time = `${String(t.getHours()).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")}`;
    const row  = document.createElement("div");
    row.className = "hv-entry";
    [["hv-time", time], ["hv-action", (e.action||"").replace(/-/g," ")], ["hv-meta", [e.provider,e.model].filter(Boolean).join(" · ")], ["hv-words", `${e.inputLen||0} → ${e.outputLen||0} chars`]].forEach(([cls,txt]) => { const s = document.createElement("span"); s.className = cls; s.textContent = txt; row.appendChild(s); });
    list.appendChild(row);
  });
  document.getElementById("history-clear-btn")?.addEventListener("click", async () => {
    if (!confirm("Clear all of today's history?")) return;
    const { historyLog: hl = [] } = await browser.storage.local.get("historyLog");
    const today = todayDate();
    await browser.storage.local.set({ historyLog: hl.filter(e => e.date !== today) });
    section.style.display = "none";
  }, { once: true });
}

async function save() {
  const { lastAction = "" } = await browser.storage.local.get("lastAction");
  const actions    = getSharedActionSettings();
  const enabledIds = new Set(actions.filter(a => a.enabled).map(a => a.id));
  let resetMsg = "";
  if (lastAction && !lastAction.startsWith("custom-") && !enabledIds.has(lastAction)) {
    const first = actions.find(a => a.enabled);
    resetMsg = ` Note: your last action was disabled. Switched to "${first?.label || first?.id}".`;
    await browser.storage.local.set({ lastAction: first?.id || "" });
  }
  await cryptoSet({
    customPrompts: getSharedCustomPrompts(), actionSettings: actions,
    profileName: getVal("profileName"), profileRole: getVal("profileRole"),
    profileStyle: getVal("profileStyle"), profileContext: getVal("profileContext"),
    profileEnabled: document.getElementById("profileEnabled")?.checked || false
  });
  const syncEnabled = document.getElementById("syncEnabled")?.checked !== false;
  await browser.storage.local.set({ syncEnabled });
  if (syncEnabled) syncWithDesktop().catch(() => {});
  const status = document.getElementById("save-status");
  status.textContent = "Saved!" + resetMsg; status.className = "status-ok";
  setTimeout(() => { status.textContent = ""; }, resetMsg ? 5000 : 2000);
}

async function saveProfile() {
  await cryptoSet({
    profileName: getVal("profileName"), profileRole: getVal("profileRole"),
    profileStyle: getVal("profileStyle"), profileContext: getVal("profileContext"),
    profileEnabled: document.getElementById("profileEnabled")?.checked || false
  });
  syncWithDesktop().catch(() => {});
  showSectionStatus("profile-save-status", "Saved!");
}

async function saveActions() {
  const { lastAction = "" } = await browser.storage.local.get("lastAction");
  const actions    = getSharedActionSettings();
  const enabledIds = new Set(actions.filter(a => a.enabled).map(a => a.id));
  if (lastAction && !lastAction.startsWith("custom-") && !enabledIds.has(lastAction))
    await browser.storage.local.set({ lastAction: actions.find(a => a.enabled)?.id || "" });
  await cryptoSet({ actionSettings: actions });
  showSectionStatus("actions-save-status", "Saved!");
}

async function saveSyncSetting() {
  const enabled = document.getElementById("syncEnabled")?.checked || false;
  await browser.storage.local.set({ syncEnabled: enabled });
  if (enabled) syncWithDesktop().catch(() => {});
  showSectionStatus("sync-save-status", "Saved!");
}

async function saveThemeSetting() {
  const mode = document.getElementById("themeToggle")?.checked ? "light" : "dark";
  await browser.storage.local.set({ themeMode: mode });
  document.documentElement.setAttribute("data-theme", mode);
  showSectionStatus("theme-save-status", "Saved!");
}

async function init() {
  await migrateStorage();
  const s = await window.appGet(STORAGE_KEYS);
  document.documentElement.setAttribute("data-theme", s.themeMode || "dark");

  // Ollama is desktop-only — strip stale extension-side Ollama entries
  if (s.configuredProviders) {
    const filtered = s.configuredProviders.filter(p => p.id !== "ollama");
    if (filtered.length !== s.configuredProviders.length) {
      s.configuredProviders = filtered;
      window.appSet({ configuredProviders: filtered });
    }
  }

  initSharedSettings(s);
  renderProviderCards();
  renderActionEditor();

  document.getElementById("add-provider-btn").addEventListener("click", showWizard);
  const openGuide = () => browser.tabs.create({ url: browser.runtime.getURL("popup/guide.html") });
  document.getElementById("open-setup-guide-btn")?.addEventListener("click", openGuide);
  document.getElementById("open-setup-guide-empty-btn")?.addEventListener("click", openGuide);
  wireDevModeEasterEgg("add-provider-btn");
  document.getElementById("wizard-cancel-1").addEventListener("click", hideWizard);
  document.getElementById("wizard-back").addEventListener("click", () => {
    document.getElementById("wizard-step-2").style.display = "none";
    document.getElementById("wizard-step-1").style.display = "block";
    clearWizardStep2();
  });
  document.getElementById("wizard-test-btn").addEventListener("click", wizardTestAndLoad);
  document.getElementById("wizard-save").addEventListener("click", saveWizardProvider);
  document.querySelectorAll(".wizard-provider-btn").forEach(btn => {
    btn.addEventListener("click", () => showWizardStep2(btn.dataset.provider));
  });
  const wzKey  = document.getElementById("wizard-api-key");
  const wzShow = document.getElementById("wizard-show-btn");
  wzShow.addEventListener("click", () => {
    wzKey.type         = wzKey.type === "password" ? "text" : "password";
    wzShow.textContent = wzKey.type === "password" ? "Show" : "Hide";
  });

  setVal("profileName", s.profileName || ""); setVal("profileRole", s.profileRole || "");
  setVal("profileStyle", s.profileStyle || ""); setVal("profileContext", s.profileContext || "");
  const profileEnabledEl = document.getElementById("profileEnabled");
  if (profileEnabledEl) profileEnabledEl.checked = s.profileEnabled || false;

  const themeToggle = document.getElementById("themeToggle");
  if (themeToggle) themeToggle.checked = (s.themeMode === "light");
  const { syncEnabled: syncVal } = await browser.storage.local.get("syncEnabled");
  const syncEl = document.getElementById("syncEnabled");
  if (syncEl) syncEl.checked = syncVal !== false;

  initCommonSettingsWiring(s);
  initProSection();
  initExportImportSection(s);
  loadHistoryViewer();
  initHistoryPinSection(s);
  initGrammarFiltersSection(s);

  document.getElementById("view-full-history-btn")?.addEventListener("click", () => {
    browser.tabs.create({ url: browser.runtime.getURL("history/history.html") });
  });
  document.getElementById("save-btn").addEventListener("click", save);
  document.getElementById("revert-btn").addEventListener("click", () => {
    if (confirm("Discard unsaved changes and reload settings?")) location.reload();
  });
  document.getElementById("profile-save-btn")?.addEventListener("click", saveProfile);
  document.getElementById("actions-save-btn")?.addEventListener("click", saveActions);
  document.getElementById("sync-save-btn")?.addEventListener("click", saveSyncSetting);
  document.getElementById("theme-save-btn")?.addEventListener("click", saveThemeSetting);

  // Auto-open wizard when redirected from popup setup CTA
  const { _setupHint } = await browser.storage.local.get("_setupHint");
  if (_setupHint && !(s.configuredProviders?.length)) {
    await browser.storage.local.remove("_setupHint");
    showWizard();
    showWizardStep2(_setupHint);
  }

  if (typeof BUILD_FLAGS !== "undefined" && BUILD_FLAGS.testBuild) {
    const banner = document.getElementById("test-only-banner");
    if (banner) banner.style.display = "block";
  }
  const { updateAvailable } = await browser.storage.local.get("updateAvailable");
  if (updateAvailable?.version) {
    const notice = document.getElementById("update-notice");
    const link   = document.getElementById("update-link");
    if (notice && link) {
      link.textContent = `Version ${updateAvailable.version} available. Download from GitHub ↗`;
      link.href = updateAvailable.url; notice.style.display = "block";
    }
  }
}

const _yr = new Date().getFullYear();
document.getElementById("copyright-year").textContent = _yr > 2026 ? `2026–${_yr}` : "2026";
init();
