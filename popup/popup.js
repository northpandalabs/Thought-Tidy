// Extension popup shell — delegates shared logic to lib/shared-popup.js

const STORAGE_KEYS = [
  "configuredProviders", "geminiModels",
  "provider", "openaiKey", "claudeKey", "geminiKey",
  "openaiModel", "claudeModel", "geminiModel",
  "variants", "customPrompts", "actionSettings", "lastAction",
  "profileName", "profileRole", "profileStyle", "profileContext", "profileEnabled",
  "licenseEmail", "licenseKey", "contextPresets", "contextEnabled", "lastContextAudience",
  "themeMode", "historyPin", "grammarFilters"
];

window.RUN_BTN_ID   = "process-btn";
window.POPUP_SOURCE = "extension";

window.buildSlotActions = (box) => {
  const copyBtn = document.createElement("button");
  copyBtn.textContent = "Copy";
  copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(box.innerText).catch(() => {});
    copyBtn.textContent = "Copied!";
    setTimeout(() => (copyBtn.textContent = "Copy"), 1600);
  });
  const useBtn = document.createElement("button");
  useBtn.className   = "replace-btn";
  useBtn.textContent = "Use this ↑";
  useBtn.addEventListener("click", () => {
    document.getElementById("input-text").value = box.innerText || "";
    document.getElementById("result-area").style.display = "none";
    document.getElementById("result-slots").innerHTML = "";
  });
  return [copyBtn, useBtn];
};

const PROVIDER_LABELS = { openai: "OpenAI", claude: "Claude", gemini: "Gemini" };

function updateProviderStatus(s) {
  const dot  = document.getElementById("key-indicator");
  const text = document.getElementById("key-text");
  if (!dot || !text) return;
  const providers = s.configuredProviders;
  const hasNew    = Array.isArray(providers) && providers.length > 0;
  const hasLegacy = s.openaiKey || s.claudeKey || s.geminiKey;
  if (hasNew) {
    dot.className    = "dot dot-ok";
    text.textContent = `Priority: ${providers.map(p => PROVIDER_LABELS[p.id] || p.id).join(" → ")}`;
  } else if (hasLegacy) {
    dot.className    = "dot dot-ok";
    text.textContent = "API key set";
  } else {
    dot.className    = "dot dot-bad";
    text.textContent = "No providers configured. Open Settings";
  }
}

async function loadHistory() {
  if (await isHistoryPinLocked()) return;
  const { historyLog = [] } = await browser.storage.local.get("historyLog");
  const entries = purgeOldLog(historyLog);
  const section = document.getElementById("history-section");
  if (!entries.length) { if (section) section.style.display = "none"; return; }
  section.style.display = "block";
  document.getElementById("history-count").textContent = entries.length;
  document.getElementById("history-toggle").addEventListener("click", () => {
    const list = document.getElementById("history-list");
    list.style.display = list.style.display === "none" ? "block" : "none";
  });
  const list = document.getElementById("history-list");
  entries.slice(-10).reverse().forEach(e => {
    const item = document.createElement("div");
    item.className = "history-item";
    const t    = new Date(e.timestamp);
    const time = `${String(t.getHours()).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")}`;
    const action = document.createElement("span");
    action.className   = "history-action";
    action.textContent = e.action.replace(/-/g, " ");
    const meta = document.createElement("span");
    meta.textContent = `${time} · ${e.source}`;
    item.append(action, meta);
    list.appendChild(item);
  });
}

async function runFromSelection() {
  const btn    = document.getElementById("run-selection-btn");
  const status = document.getElementById("run-selection-status");
  status.style.display = "none";
  btn.disabled = true;
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab.");
    const [{ result: selectedText }] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString()?.trim() || ""
    });
    if (!selectedText) {
      status.textContent = "No text selected on the page. Highlight text first.";
      status.style.display = "block";
      return;
    }
    const actionVal = document.getElementById("action-select").value;
    await browser.runtime.sendMessage({ type: "run-from-popup", tabId: tab.id, actionVal, selectedText });
    await browser.storage.local.set({ lastAction: actionVal });
    window.close();
  } catch (err) {
    status.textContent = err.message;
    status.style.display = "block";
  } finally {
    btn.disabled = false;
  }
}

async function init() {
  const s = await window.appGet(STORAGE_KEYS);
  setPopupSettings(s);
  document.documentElement.setAttribute("data-theme", s.themeMode || "dark");

  rebuildVariantsSelect();
  updateProviderStatus(s);
  populateAudienceSelect();
  initTextareaAutogrow();
  restoreContextAudience();
  wireContextSheetHandlers();
  rebuildActionDropdown();

  const providers    = s.configuredProviders;
  const hasProvider  = Array.isArray(providers) && providers.length > 0;
  const hasLegacyKey = s.openaiKey || s.claudeKey || s.geminiKey;
  const ctaEl = document.getElementById("setup-cta");
  if (ctaEl) ctaEl.style.display = (hasProvider || hasLegacyKey) ? "none" : "block";

  document.getElementById("variants-select")?.addEventListener("change", (e) => {
    window.appSet({ variants: e.target.value });
  });
  document.getElementById("open-settings").addEventListener("click", () => {
    browser.runtime.openOptionsPage();
  });
  document.getElementById("open-settings-cta")?.addEventListener("click", () => {
    browser.runtime.openOptionsPage();
  });
  document.getElementById("open-settings-gemini-cta")?.addEventListener("click", async () => {
    await browser.storage.local.set({ _setupHint: "gemini" });
    browser.runtime.openOptionsPage();
  });
  document.getElementById("open-guide-btn")?.addEventListener("click", () => {
    browser.tabs.create({ url: browser.runtime.getURL("popup/guide.html") });
  });
  document.getElementById("process-btn").addEventListener("click", runProcess);
  document.getElementById("run-selection-btn").addEventListener("click", runFromSelection);

  const { historyLog: rawLog = [] } = await browser.storage.local.get("historyLog");
  const purged = purgeOldLog(rawLog);
  if (purged.length !== rawLog.length) await browser.storage.local.set({ historyLog: purged });
  loadHistory();
}

init();
