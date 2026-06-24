// Extension popup shell — delegates shared logic to lib/shared-popup.js

const STORAGE_KEYS = [
  "configuredProviders", "geminiModels",
  "provider", "openaiKey", "claudeKey", "geminiKey",
  "openaiModel", "claudeModel", "geminiModel",
  "variants", "customPrompts", "actionSettings", "lastAction",
  "profileName", "profileRole", "profileStyle", "profileContext", "profileEnabled", "profileVocab",
  "licenseEmail", "licenseKey", "demoMode", "corpMode", "contextPresets", "contextEnabled", "lastContextAudience",
  "themeMode", "historyPin", "grammarFilters", "inputTextDraft", "showClarityCheckBtn"
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

  rebuildActionDropdown();
  rebuildVariantsSelect();
  populateAudienceSelect();
  restoreContextAudience();
  wireContextSheetHandlers();
  wireClarityCheckBtn();
  const ta = document.getElementById("input-text");
  ta?.focus();
  initTextareaAutogrow();

  if (ta && s.inputTextDraft) { ta.value = s.inputTextDraft; ta.dispatchEvent(new Event("input")); }
  let _draftTimer;
  ta?.addEventListener("input", () => {
    clearTimeout(_draftTimer);
    _draftTimer = setTimeout(() => browser.storage.local.set({ inputTextDraft: ta.value }), 400);
  });
  ta?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const btn = document.getElementById("process-btn");
      if (!btn || btn.disabled) return;
      runProcess();
    }
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

  // Daily checks — fires for Gumroad, demo, and corp modes (at most once per 24 h each).
  if (s.licenseEmail || s.licenseKey || s.demoMode || s.corpMode) {
    checkLicensePeriodically(s.licenseEmail || "", s.licenseKey || "").then(r => {
      if (r?.revoked) {
        browser.storage.local.remove(["licenseEmail", "licenseKey", "deviceActivated"]);
        setPopupSettings({ ...getPopupSettings(), licenseEmail: "", licenseKey: "", demoMode: false, corpMode: false });
        rebuildVariantsSelect();
      }
    }).catch(() => {});
  }
}

init();

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  const relevant = ["showClarityCheckBtn", "contextEnabled"];
  if (!relevant.some(k => k in changes)) return;
  const s = getPopupSettings();
  const patch = {};
  if ("showClarityCheckBtn" in changes) patch.showClarityCheckBtn = changes.showClarityCheckBtn.newValue;
  if ("contextEnabled"      in changes) patch.contextEnabled      = changes.contextEnabled.newValue;
  setPopupSettings({ ...s, ...patch });
  rebuildVariantsSelect();
  restoreContextAudience();
});

