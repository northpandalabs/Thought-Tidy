const DEFAULT_MODELS = {
  openai: "gpt-4o-mini",
  claude: "claude-haiku-4-5-20251001",
  gemini: "gemini-2.0-flash"
};

const KEY_FIELDS   = { openai: "openaiKey",   claude: "claudeKey",   gemini: "geminiKey" };
const MODEL_FIELDS = { openai: "openaiModel",  claude: "claudeModel", gemini: "geminiModel" };

let currentSettings = {};

async function init() {
  currentSettings = await browser.storage.local.get([
    "provider", "variants",
    "openaiKey", "claudeKey", "geminiKey",
    "openaiModel", "claudeModel", "geminiModel",
    "customPrompts", "lastAction",
    "profileName", "profileRole", "profileStyle", "profileContext", "profileEnabled"
  ]);

  const providerEl  = document.getElementById("provider");
  const variantsEl  = document.getElementById("variants");
  const variantsVal = document.getElementById("variants-val");

  providerEl.value = currentSettings.provider || "openai";
  variantsEl.value = currentSettings.variants  || 1;
  variantsVal.textContent = variantsEl.value;

  updateStatus(currentSettings, providerEl.value);
  updateModelDisplay(currentSettings, providerEl.value);

  // Populate custom prompts into action select
  const actionSel = document.getElementById("action-select");
  const cps = currentSettings.customPrompts || [];
  if (cps.length) {
    const sep = document.createElement("option");
    sep.disabled = true;
    sep.textContent = "── Custom ──";
    actionSel.appendChild(sep);
    cps.slice(0, 8).forEach((cp, i) => {
      const opt = document.createElement("option");
      opt.value = `custom-${i}`;
      opt.textContent = `⚡ ${cp.name}`;
      actionSel.appendChild(opt);
    });
  }
  // Restore last-used action (after custom options are appended so the value is available)
  actionSel.value = currentSettings.lastAction || "fix-spelling";

  // Setup CTA: if no key for the active provider, show prominent prompt
  const hasAnyKey = currentSettings.openaiKey || currentSettings.claudeKey || currentSettings.geminiKey;
  const ctaEl = document.getElementById("setup-cta");
  if (ctaEl) ctaEl.style.display = hasAnyKey ? "none" : "block";

  providerEl.addEventListener("change", () => {
    currentSettings.provider = providerEl.value;
    browser.storage.local.set({ provider: providerEl.value });
    updateStatus(currentSettings, providerEl.value);
    updateModelDisplay(currentSettings, providerEl.value);
  });

  variantsEl.addEventListener("input", () => {
    variantsVal.textContent = variantsEl.value;
    browser.storage.local.set({ variants: variantsEl.value });
  });

  document.getElementById("open-settings").addEventListener("click", () => {
    browser.runtime.openOptionsPage();
  });
  document.getElementById("open-settings-cta")?.addEventListener("click", () => {
    browser.runtime.openOptionsPage();
  });

  document.getElementById("process-btn").addEventListener("click", runProcess);
  document.getElementById("run-selection-btn").addEventListener("click", runFromSelection);

  document.getElementById("copy-result").addEventListener("click", () => {
    const text = document.getElementById("result-text").textContent;
    navigator.clipboard.writeText(text).catch(() => {});
    const btn = document.getElementById("copy-result");
    btn.textContent = "Copied!";
    setTimeout(() => (btn.textContent = "Copy"), 1600);
  });

  // Purge stale log entries then render today's activity
  const { historyLog: rawLog = [] } = await browser.storage.local.get("historyLog");
  const purged = purgeOldLog(rawLog);
  if (purged.length !== rawLog.length) {
    await browser.storage.local.set({ historyLog: purged });
  }
  loadHistory();
}

async function runFromSelection() {
  const btn    = document.getElementById("run-selection-btn");
  const status = document.getElementById("run-selection-status");
  status.style.display = "none";
  btn.disabled = true;

  try {
    // Get the active tab's selected text via the scripting API
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab.");

    const [{ result: selectedText }] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString()?.trim() || ""
    });

    if (!selectedText) {
      status.textContent = "No text selected on the page — highlight text first.";
      status.style.display = "block";
      return;
    }

    const actionVal = document.getElementById("action-select").value;
    // Send only non-sensitive context — background reads keys from storage itself
    await browser.runtime.sendMessage({
      type: "run-from-popup",
      tabId: tab.id,
      actionVal,
      selectedText
    });

    await browser.storage.local.set({ lastAction: actionVal });
    window.close(); // close popup; result modal will appear on the page
  } catch (err) {
    status.textContent = err.message;
    status.style.display = "block";
  } finally {
    btn.disabled = false;
  }
}

async function runProcess() {
  const text = document.getElementById("input-text").value.trim();
  if (!text) return;

  const provider = currentSettings.provider || "openai";
  const key = currentSettings[KEY_FIELDS[provider]];
  if (!key) {
    showResult(null, "No API key set for this provider — open Full Settings first.");
    return;
  }

  const actionVal = document.getElementById("action-select").value;
  const cps = currentSettings.customPrompts || [];
  let systemPrompt;

  if (actionVal.startsWith("custom-")) {
    const idx = parseInt(actionVal.replace("custom-", ""), 10);
    systemPrompt = cps[idx]?.prompt || "Process the following text:";
  } else {
    systemPrompt = MENU_PROMPTS[actionVal]; // from lib/prompts.js
    if (!systemPrompt) return;
  }

  systemPrompt = buildPromptWithProfile(systemPrompt, currentSettings); // from lib/prompts.js

  showLoading(true);

  try {
    const result = await callAI(provider, currentSettings, systemPrompt, text); // from lib/api.js
    showResult(result, null);
    await browser.storage.local.set({ lastAction: actionVal });
  } catch (err) {
    showResult(null, `Error: ${err.message}`);
  }
}

function showLoading(on) {
  document.getElementById("result-area").style.display = "block";
  document.getElementById("result-loading").style.display = on ? "flex" : "none";
  document.getElementById("result-text").textContent = "";
  document.getElementById("result-actions").style.display = "none";
}

function showResult(text, error) {
  document.getElementById("result-loading").style.display = "none";
  const textEl = document.getElementById("result-text");
  if (error) {
    textEl.textContent = error;
    textEl.className = "result-text result-error";
    document.getElementById("result-actions").style.display = "none";
  } else {
    textEl.textContent = text;
    textEl.className = "result-text";
    document.getElementById("result-actions").style.display = "flex";
  }
}

function updateStatus(settings, provider) {
  const key  = settings[KEY_FIELDS[provider]];
  const dot  = document.getElementById("key-indicator");
  const text = document.getElementById("key-text");
  if (key) {
    dot.className    = "dot dot-ok";
    text.textContent = "API key set";
  } else {
    dot.className    = "dot dot-bad";
    text.textContent = "No API key — open Settings";
  }
}

function updateModelDisplay(settings, provider) {
  const model = settings[MODEL_FIELDS[provider]] || DEFAULT_MODELS[provider];
  document.getElementById("model-display").textContent = model;
}

async function loadHistory() {
  const { historyLog = [] } = await browser.storage.local.get("historyLog");
  const entries = purgeOldLog(historyLog); // uses todayDate() internally

  const section = document.getElementById("history-section");
  if (!entries.length) { if (section) section.style.display = "none"; return; }

  section.style.display = "block";
  document.getElementById("history-count").textContent = entries.length;

  // Persistent toggle — no { once: true } so collapse also works
  document.getElementById("history-toggle").addEventListener("click", () => {
    const list = document.getElementById("history-list");
    list.style.display = list.style.display === "none" ? "block" : "none";
  });

  const list = document.getElementById("history-list");
  entries.slice(-10).reverse().forEach(e => {
    const item = document.createElement("div");
    item.className = "history-item";
    const t = new Date(e.timestamp);
    const time = `${String(t.getHours()).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")}`;
    const action = document.createElement("span");
    action.className = "history-action";
    action.textContent = e.action.replace(/-/g, " ");
    const meta = document.createElement("span");
    meta.textContent = `${time} · ${e.source}`;
    item.append(action, meta);
    list.appendChild(item);
  });
}

init();
