// Extension popup shell — delegates shared logic to lib/shared-popup.js

const STORAGE_KEYS = [
  "configuredProviders", "geminiModels",
  "provider", "openaiKey", "claudeKey", "geminiKey",
  "openaiModel", "claudeModel", "geminiModel",
  "variants", "customPrompts", "actionSettings", "lastAction",
  "profileName", "profileRole", "profileStyle", "profileContext", "profileEnabled",
  "licenseEmail", "licenseKey", "contextPresets", "contextEnabled", "lastContextAudience",
  "themeMode", "historyPin", "grammarFilters", "inputTextDraft"
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

let _historyToggleWired = false;

async function loadHistory() {
  const pinLocked = await isHistoryPinLocked();
  const { historyFull = [] } = await browser.storage.local.get("historyFull");
  const entries = purgeOldLog(historyFull);
  const section = document.getElementById("history-section");
  if (!section) return;
  if (!entries.length && !pinLocked) { section.style.display = "none"; return; }
  section.style.display = "block";
  const toggle = document.getElementById("history-toggle");
  const list   = document.getElementById("history-list");
  if (pinLocked) {
    if (toggle) toggle.innerHTML = "🔒 History locked";
    if (!_historyToggleWired && toggle && list) {
      _historyToggleWired = true;
      toggle.addEventListener("click", () => {
        const open = list.style.display !== "none";
        list.style.display = open ? "none" : "block";
        if (!open && !list.children.length) {
          const btn = document.createElement("button");
          btn.textContent = "View history";
          btn.className = "history-view-btn";
          btn.addEventListener("click", () => {
            browser.tabs.create({ url: browser.runtime.getURL("history/history.html") });
            window.close();
          });
          list.appendChild(btn);
        }
      });
    }
    return;
  }
  if (toggle) document.getElementById("history-count").textContent = entries.length;
  if (!_historyToggleWired && toggle && list) {
    _historyToggleWired = true;
    toggle.addEventListener("click", () => {
      list.style.display = list.style.display === "none" ? "block" : "none";
    });
  }
  list.innerHTML = "";
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

  const viewAllBtn = document.createElement("button");
  viewAllBtn.className = "history-view-btn";
  viewAllBtn.textContent = "View in History →";
  viewAllBtn.addEventListener("click", () => {
    browser.tabs.create({ url: browser.runtime.getURL("history/history.html") });
    window.close();
  });
  list.appendChild(viewAllBtn);
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

  const ta = document.getElementById("input-text");
  if (ta && s.inputTextDraft) { ta.value = s.inputTextDraft; ta.dispatchEvent(new Event("input")); }
  let _draftTimer;
  ta?.addEventListener("input", () => {
    clearTimeout(_draftTimer);
    _draftTimer = setTimeout(() => browser.storage.local.set({ inputTextDraft: ta.value }), 400);
  });

  const providers    = s.configuredProviders;
  const hasProvider  = Array.isArray(providers) && providers.length > 0;
  const hasLegacyKey = s.openaiKey || s.claudeKey || s.geminiKey;
  const ctaEl = document.getElementById("setup-cta");
  if (ctaEl) ctaEl.style.display = (hasProvider || hasLegacyKey) ? "none" : "block";

  document.getElementById("variants-select")?.addEventListener("change", (e) => {
    window.appSet({ variants: e.target.value });
  });
  document.getElementById("open-history-btn").addEventListener("click", () => {
    browser.tabs.create({ url: browser.runtime.getURL("history/history.html") });
    window.close();
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

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !("historyPin" in changes)) return;
  _historyToggleWired = false;
  loadHistory();
});
