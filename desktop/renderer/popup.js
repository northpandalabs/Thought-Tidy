// Desktop popup shell — delegates shared logic to lib/shared-popup.js
/* global browser, btcAPI, todayDate, purgeOldLog */

window.RUN_BTN_ID   = "run-btn";
window.POPUP_SOURCE = "desktop";

window.buildSlotActions = (box) => {
  const copyBtn = document.createElement("button");
  copyBtn.textContent = "Copy";
  copyBtn.addEventListener("click", async () => {
    await btcAPI.writeClipboard(box.innerText);
    copyBtn.textContent = "Copied!";
    setTimeout(() => (copyBtn.textContent = "Copy"), 1600);
  });
  const copyCloseBtn = document.createElement("button");
  copyCloseBtn.className   = "copy-close-btn";
  copyCloseBtn.textContent = "Copy & Close";
  copyCloseBtn.addEventListener("click", async () => {
    await btcAPI.writeClipboard(box.innerText);
    btcAPI.closePopup();
  });
  return [copyBtn, copyCloseBtn];
};

window.onRunComplete = () => loadHistory();

const PROVIDER_LABELS = { openai: "OpenAI", claude: "Claude", gemini: "Gemini" };

const STORAGE_KEYS = [
  "configuredProviders", "geminiModels",
  "provider", "openaiKey", "claudeKey", "geminiKey",
  "openaiModel", "claudeModel", "geminiModel",
  "variants", "customPrompts", "actionSettings", "lastAction",
  "profileName", "profileRole", "profileStyle", "profileContext", "profileEnabled",
  "licenseEmail", "licenseKey", "showContextField", "contextText", "contextLevel", "contextPresets",
  "lastContextAudience", "contextEnabled", "themeMode", "historyPin", "grammarFilters"
];

function updateFooter() {
  const badge = document.getElementById("provider-badge");
  if (!badge) return;
  const s         = getPopupSettings();
  const providers = s.configuredProviders;
  if (Array.isArray(providers) && providers.length > 0) {
    const p     = providers[0];
    const label = PROVIDER_LABELS[p.id] || p.id;
    const model = p.id === "gemini"
      ? (s.geminiModels?.find(Boolean) || p.model || "")
      : (p.model || "");
    badge.textContent = model ? `${label} · ${model}` : label;
  } else {
    badge.textContent = "No provider. Open Settings";
  }
}

let _historyToggleWired = false;

async function loadHistory() {
  const pinLocked = await isHistoryPinLocked();
  const { historyFull = [] } = await browser.storage.local.get("historyFull");
  const today   = todayDate();
  const entries = historyFull.filter(e => e.date === today);
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
          btn.addEventListener("click", () => btcAPI.openHistory());
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
}

async function init() {
  const s = await window.appGet(STORAGE_KEYS);
  setPopupSettings(s);
  document.documentElement.setAttribute("data-theme", s.themeMode || "dark");
  updateFooter();
  rebuildActionDropdown();
  rebuildVariantsSelect();
  populateAudienceSelect();
  restoreContextAudience();
  wireContextSheetHandlers();
  document.getElementById("input-text").focus();
  initTextareaAutogrow();

  btcAPI.onPopupOpened(async () => {
    const fresh = await window.appGet(STORAGE_KEYS);
    setPopupSettings(fresh);
    document.documentElement.setAttribute("data-theme", fresh.themeMode || "dark");
    updateFooter();
    rebuildActionDropdown();
    rebuildVariantsSelect();
    populateAudienceSelect();
    restoreContextAudience();
    // Reset multi-column layout if a previous run left it expanded
    document.getElementById("result-expand-btn")?.remove();
    document.getElementById("result-slots")?.classList.remove("multi-col");
    btcAPI.resizePopup(1);
    _historyToggleWired = false;
    loadHistory();
    document.getElementById("input-text").focus();
  });

  document.getElementById("variants-select")?.addEventListener("change", (e) => {
    window.appSet({ variants: e.target.value });
  });

  document.getElementById("close-btn").addEventListener("click", () => btcAPI.closePopup());
  document.getElementById("settings-btn").addEventListener("click", () => btcAPI.openSettings());
  document.getElementById("run-btn").addEventListener("click", runProcess);

  document.getElementById("paste-btn").addEventListener("click", async () => {
    const text = (await btcAPI.readClipboard()).trim();
    if (!text) return;
    const textarea = document.getElementById("input-text");
    textarea.value = text;
    textarea.focus();
    textarea.select();
  });

  document.getElementById("input-text").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      runProcess();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") btcAPI.closePopup();
    if (e.ctrlKey && (e.key === "+" || e.key === "-" || e.key === "=" || e.key === "0")) {
      e.preventDefault();
    }
  });
  document.addEventListener("wheel", (e) => {
    if (e.ctrlKey) e.preventDefault();
  }, { passive: false });
}

init().then(loadHistory);
