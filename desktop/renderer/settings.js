// Desktop settings shell — delegates shared logic to lib/shared-settings.js
/* global browser, btcAPI, todayDate, isProUnlocked */

const STORAGE_KEYS = [
  "configuredProviders", "geminiModels",
  "provider", "openaiKey", "openaiModel", "claudeKey", "claudeModel", "geminiKey", "geminiModel",
  "variants", "customPrompts", "actionSettings",
  "profileName", "profileRole", "profileStyle", "profileContext", "profileEnabled", "profileVocab",
  "licenseEmail", "licenseKey", "contextPresets", "contextEnabled", "audienceLevel", "devMode",
  "zoomLevel", "themeMode", "clearOnOpen", "historyPin", "grammarFilters"
];

window.platformOpenURL    = url => btcAPI.openURL(url);
window.proActiveBtnText   = "✓ Activated";
window.platformSaveBackup = (content, filename) => btcAPI.saveBackup(content, filename);
window.platformOpenBackup = () => btcAPI.openBackup();
window.applyProGateExtras = (isPro) => {
  const btn = document.querySelector('.wizard-provider-btn[data-provider="ollama"]');
  if (btn) { btn.disabled = !isPro; btn.title = isPro ? "" : "Pro feature. Unlock Pro to use Ollama."; }
};

function wireLinks() {
  const map = {
    "link-github":         "https://github.com/northpandalabs/Thought-Tidy",
    "link-issues":         "https://github.com/northpandalabs/Thought-Tidy/issues",
    "link-author":         "https://github.com/northpandalabs",
    "link-footer-github":  "https://github.com/northpandalabs/Thought-Tidy",
    "link-footer-privacy": "https://raw.githubusercontent.com/northpandalabs/Thought-Tidy/refs/heads/main/legal/privacy.txt",
    "link-footer-eula":    "https://raw.githubusercontent.com/northpandalabs/Thought-Tidy/refs/heads/main/legal/eula.txt"
  };
  for (const [id, url] of Object.entries(map))
    document.getElementById(id)?.addEventListener("click", () => btcAPI.openURL(url));
}

async function loadHistoryViewer() {
  const stored = await browser.storage.local.get(["historyFull", "historyLog", "licenseEmail", "licenseKey", "historyPin"]);
  const isPro   = isProUnlocked(stored);
  const today  = todayDate();
  const src    = (stored.historyFull||[]).length ? stored.historyFull : (stored.historyLog||[]);
  const entries = src.filter(e => e.date === today);
  const section = document.getElementById("history-viewer-section");
  if (!section) return;
  if (!isPro) { section.style.display = "none"; return; }
  section.style.display = "";
  const titleEl = document.getElementById("history-title-text");
  if (stored.historyPin) {
    if (titleEl) titleEl.textContent = "🔒 History";
    document.getElementById("history-viewer-count").textContent = "";
    document.getElementById("history-clear-btn")?.style.setProperty("display", "none");
    return;
  }
  if (titleEl) titleEl.textContent = "Today's History";
  if (!entries.length) { section.style.display = "none"; return; }
  document.getElementById("history-viewer-count").textContent = entries.length;
  const list = document.getElementById("history-viewer-list");
  list.innerHTML = "";
  [...entries].reverse().forEach(e => {
    const t    = new Date(e.timestamp);
    const time = `${String(t.getHours()).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")}`;
    const inT  = e.inputTokens ?? e.inputLen ?? 0;
    const outT = e.outputTokens ?? e.outputLen ?? 0;
    const row  = document.createElement("div");
    row.className = "hv-entry";
    [["hv-time", time], ["hv-action", (e.action||"").replace(/-/g," ")], ["hv-meta", [e.provider,e.model].filter(Boolean).join(" · ")], ["hv-words", `${inT} → ${outT}`]].forEach(([cls,txt]) => { const s = document.createElement("span"); s.className = cls; s.textContent = txt; row.appendChild(s); });
    list.appendChild(row);
  });
  document.getElementById("history-clear-btn")?.addEventListener("click", async () => {
    if (!confirm("Clear all of today's history?")) return;
    const { historyFull: hf=[], historyLog: hl=[] } = await browser.storage.local.get(["historyFull","historyLog"]);
    await browser.storage.local.set({ historyFull: hf.filter(e=>e.date!==today), historyLog: hl.filter(e=>e.date!==today) });
    document.getElementById("history-viewer-count").textContent = "0";
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
  await browser.storage.local.set({
    customPrompts: getSharedCustomPrompts(), actionSettings: actions,
    profileName: getVal("profileName"), profileRole: getVal("profileRole"),
    profileStyle: getVal("profileStyle"), profileContext: getVal("profileContext"),
    profileEnabled: document.getElementById("profileEnabled")?.checked || false
  });
  isDirty = false;
  const status = document.getElementById("save-status");
  status.textContent = "Saved!" + resetMsg; status.className = "status-ok";
  setTimeout(() => { status.textContent = ""; }, resetMsg ? 5000 : 2000);
}

async function saveProfile() {
  await browser.storage.local.set({
    profileName: getVal("profileName"), profileRole: getVal("profileRole"),
    profileStyle: getVal("profileStyle"), profileContext: getVal("profileContext"),
    profileEnabled: document.getElementById("profileEnabled")?.checked || false,
  });
  showSectionStatus("profile-save-status", "Saved!");
}

async function saveBehavior() {
  if (typeof btcAPI !== "undefined" && btcAPI.setLoginItemEnabled)
    await btcAPI.setLoginItemEnabled(document.getElementById("launchAtLogin")?.checked || false);
  showSectionStatus("behavior-save-status", "Saved!");
}

async function saveActionOrder() {
  const { lastAction = "" } = await browser.storage.local.get("lastAction");
  const actions    = getSharedActionSettings();
  const enabledIds = new Set(actions.filter(a => a.enabled).map(a => a.id));
  if (lastAction && !lastAction.startsWith("custom-") && !enabledIds.has(lastAction))
    await browser.storage.local.set({ lastAction: actions.find(a => a.enabled)?.id || "" });
  await browser.storage.local.set({ actionSettings: actions });
  showSectionStatus("actions-save-status", "Saved!");
}

let isDirty = false;

async function init() {
  let _pendingAppVersion = null;
  wireLinks();
  const titlebarIcon = document.getElementById("titlebar-icon");
  if (titlebarIcon) titlebarIcon.addEventListener("error", () => { titlebarIcon.style.display = "none"; });
  const _yr = new Date().getFullYear();
  document.getElementById("copyright-year").textContent = _yr > 2026 ? `2026–${_yr}` : "2026";

  if (typeof btcAPI !== "undefined" && btcAPI.getAppConfig) {
    const cfg = await btcAPI.getAppConfig();
    if (cfg.isTestBuild) { const b = document.getElementById("test-only-banner"); if (b) b.style.display = "block"; }
    if (cfg.appVersion) {
      const [base, hash] = cfg.appVersion.split("+");
      const label = hash ? `v${base} (dev ${hash})` : `v${base}`;
      const el = document.getElementById("app-version-label");
      if (el) el.textContent = label;
      _pendingAppVersion = label; // applied after initSharedSettings creates the element
    }
    if (cfg.updateAvailable?.version) {
      const notice = document.getElementById("update-notice");
      const link   = document.getElementById("update-link");
      if (notice && link) {
        link.textContent = `Version ${cfg.updateAvailable.version} available. Download from GitHub ↗`;
        link.addEventListener("click", () => btcAPI.openURL(cfg.updateAvailable.url));
        notice.style.display = "block";
      }
    }
    try { const at = await btcAPI.getLoginItemEnabled(); const el = document.getElementById("launchAtLogin"); if (el) el.checked = !!at; } catch {}
  }

  await migrateStorage();
  const s = await window.appGet(STORAGE_KEYS);

  const themeEl = document.getElementById("app-theme");
  const applyTheme = m => document.documentElement.setAttribute("data-theme", m || "dark");
  if (themeEl) themeEl.value = s.themeMode || "dark";
  applyTheme(s.themeMode || "dark");
  themeEl?.addEventListener("change", async () => { const t = themeEl.value||"dark"; await browser.storage.local.set({themeMode:t}); applyTheme(t); });

  const zoomEl = document.getElementById("zoom-level");
  if (zoomEl) zoomEl.value = s.zoomLevel || "auto";
  document.getElementById("zoom-save-btn")?.addEventListener("click", async () => {
    const zoom = document.getElementById("zoom-level")?.value || "auto";
    await browser.storage.local.set({ zoomLevel: zoom });
    if (typeof btcAPI !== "undefined" && btcAPI.setZoom) btcAPI.setZoom(zoom);
    showSectionStatus("zoom-save-status", "Saved!");
  });

  const clearOnOpenChk = document.getElementById("clear-on-open-chk");
  if (clearOnOpenChk) {
    clearOnOpenChk.checked = !!s.clearOnOpen;
    clearOnOpenChk.addEventListener("change", () => browser.storage.local.set({ clearOnOpen: clearOnOpenChk.checked }));
  }

  document.getElementById("display-panel-btn")?.addEventListener("click", () => {
    const p = document.getElementById("display-panel"); if (p) p.style.display = p.style.display==="none"?"block":"none";
  });
  document.getElementById("display-panel-close")?.addEventListener("click", () => {
    const p = document.getElementById("display-panel"); if (p) p.style.display = "none";
  });
  document.getElementById("activate-pro-link-btn")?.addEventListener("click", () => {
    document.getElementById("display-panel")?.style.setProperty("display","none");
  });

  initSharedSettings(s);
  renderProviderCards();
  renderActionEditor();

  document.getElementById("add-provider-btn").addEventListener("click", showWizard);
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
  const wzKey = document.getElementById("wizard-api-key");
  const wzShow = document.getElementById("wizard-show-btn");
  wzShow.addEventListener("click", () => {
    wzKey.type = wzKey.type==="password"?"text":"password"; wzShow.textContent = wzKey.type==="password"?"Show":"Hide";
  });

  setVal("profileName", s.profileName||""); setVal("profileRole", s.profileRole||"");
  setVal("profileStyle", s.profileStyle||""); setVal("profileContext", s.profileContext||"");
  const profEl = document.getElementById("profileEnabled");
  if (profEl) profEl.checked = s.profileEnabled || false;

  initCommonSettingsWiring(s);
  document.getElementById("contextEnabled")?.addEventListener("change", async () => {
    await browser.storage.local.set({ contextEnabled: document.getElementById("contextEnabled")?.checked !== false });
  });

  initProSection();
  initExportImportSection(s);
  if (_pendingAppVersion) {
    const aboutEl = document.getElementById("about-version-text");
    if (aboutEl) aboutEl.textContent = _pendingAppVersion;
  }
  loadHistoryViewer();
  initHistoryPinSection(s);
  initVocabSection(s);
  initGrammarFiltersSection(s);
  document.getElementById("view-full-history-btn")?.addEventListener("click", () => btcAPI.openHistory());
  document.getElementById("save-btn").addEventListener("click", save);
  document.getElementById("revert-btn").addEventListener("click", () => {
    if (confirm("Discard unsaved changes and reload settings?")) location.reload();
  });
  document.getElementById("profile-save-btn")?.addEventListener("click", saveProfile);
  document.getElementById("behavior-save-btn")?.addEventListener("click", saveBehavior);
  document.getElementById("actions-save-btn")?.addEventListener("click", saveActionOrder);

  document.querySelector(".page").addEventListener("input",  () => { isDirty = true; });
  document.querySelector(".page").addEventListener("change", () => { isDirty = true; });
  window.addEventListener("beforeunload", e => { if (isDirty) e.returnValue = ""; });
  window.addEventListener("focus", () => loadHistoryViewer());
}

init();
