const PROVIDER_LABELS = { openai: "OpenAI", claude: "Claude", gemini: "Gemini" };

const STORAGE_KEYS = [
  "configuredProviders", "geminiModels",
  // legacy keys — passed to callAIWithFallback migration shim
  "provider", "openaiKey", "claudeKey", "geminiKey",
  "openaiModel", "claudeModel", "geminiModel",
  "variants", "customPrompts", "actionSettings", "lastAction",
  "profileName", "profileRole", "profileStyle", "profileContext", "profileEnabled"
];

let currentSettings = {};

async function init() {
  currentSettings = await browser.storage.local.get(STORAGE_KEYS);

  const variantsEl  = document.getElementById("variants");
  const variantsVal = document.getElementById("variants-val");

  variantsEl.value    = currentSettings.variants || 1;
  variantsVal.textContent = variantsEl.value;

  updateProviderStatus(currentSettings);

  // Populate action dropdown from actionSettings (user-ordered/enabled list) + custom prompts
  const actionSel   = document.getElementById("action-select");
  const storedActs  = resolveActionSettings(currentSettings.actionSettings || []);
  const cps         = currentSettings.customPrompts || [];

  storedActs.filter(a => a.enabled).forEach(a => {
    const opt = document.createElement("option");
    opt.value = a.id; opt.textContent = a.label;
    actionSel.appendChild(opt);
  });
  if (cps.length) {
    const sep = document.createElement("option"); sep.disabled = true; sep.textContent = "── Custom ──";
    actionSel.appendChild(sep);
    cps.slice(0, 8).forEach((cp, i) => {
      const opt = document.createElement("option");
      opt.value = `custom-${i}`; opt.textContent = `⚡ ${cp.name}`;
      actionSel.appendChild(opt);
    });
  }
  const lastAction = currentSettings.lastAction || "";
  actionSel.value  = actionSel.querySelector(`option[value="${lastAction}"]`) ? lastAction : (storedActs.find(a => a.enabled)?.id || "");

  // Setup CTA: shown when no providers configured
  const providers   = currentSettings.configuredProviders;
  const hasProvider = Array.isArray(providers) && providers.length > 0;
  const hasLegacyKey = currentSettings.openaiKey || currentSettings.claudeKey || currentSettings.geminiKey;
  const ctaEl = document.getElementById("setup-cta");
  if (ctaEl) ctaEl.style.display = (hasProvider || hasLegacyKey) ? "none" : "block";

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

  const { historyLog: rawLog = [] } = await browser.storage.local.get("historyLog");
  const purged = purgeOldLog(rawLog);
  if (purged.length !== rawLog.length) await browser.storage.local.set({ historyLog: purged });
  loadHistory();
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
      status.textContent = "No text selected on the page — highlight text first.";
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

async function runProcess() {
  const text = document.getElementById("input-text").value.trim();
  if (!text) return;

  const actionVal = document.getElementById("action-select").value;
  const cps       = currentSettings.customPrompts || [];
  let systemPrompt;
  if (actionVal.startsWith("custom-")) {
    const idx    = parseInt(actionVal.replace("custom-", ""), 10);
    systemPrompt = cps[idx]?.prompt || "Process the following text:";
  } else {
    systemPrompt = MENU_PROMPTS[actionVal];
    if (!systemPrompt) return;
  }
  systemPrompt = buildPromptWithProfile(systemPrompt, currentSettings);

  showLoading(true);
  try {
    const { result, usedProvider, usedModel } = await callAIWithFallback(
      currentSettings.configuredProviders,
      currentSettings.geminiModels,
      currentSettings,
      systemPrompt,
      text
    );
    showResult(result, null);
    await browser.storage.local.set({ lastAction: actionVal });

    const today = todayDate();
    const { historyFull = [] } = await browser.storage.local.get("historyFull");
    const cost = estimateCost(usedModel, text, [result]);
    historyFull.push({
      id: uid(), timestamp: Date.now(), date: today, source: "extension",
      action: actionVal, provider: usedProvider, model: usedModel,
      inputText: text.slice(0, 5000),
      outputs: [result.slice(0, 5000)],
      ...cost
    });
    await browser.storage.local.set({ historyFull: historyFull.slice(-500) });
  } catch (err) {
    showResult(null, `Error: ${err.message}`);
  }
}

function showLoading(on) {
  document.getElementById("result-area").style.display  = "block";
  document.getElementById("result-loading").style.display = on ? "flex" : "none";
  document.getElementById("result-text").textContent    = "";
  document.getElementById("result-actions").style.display = "none";
}

function showResult(text, error) {
  document.getElementById("result-loading").style.display = "none";
  const textEl = document.getElementById("result-text");
  if (error) {
    textEl.textContent = error;
    textEl.className   = "result-text result-error";
    document.getElementById("result-actions").style.display = "none";
  } else {
    textEl.textContent = text;
    textEl.className   = "result-text";
    document.getElementById("result-actions").style.display = "flex";
  }
}

function updateProviderStatus(settings) {
  const providers = settings.configuredProviders;
  const dot  = document.getElementById("key-indicator");
  const text = document.getElementById("key-text");
  if (!dot || !text) return;

  const hasNew    = Array.isArray(providers) && providers.length > 0;
  const hasLegacy = settings.openaiKey || settings.claudeKey || settings.geminiKey;

  if (hasNew) {
    dot.className    = "dot dot-ok";
    const names      = providers.map(p => PROVIDER_LABELS[p.id] || p.id).join(" → ");
    text.textContent = `Priority: ${names}`;
  } else if (hasLegacy) {
    dot.className    = "dot dot-ok";
    text.textContent = "API key set";
  } else {
    dot.className    = "dot dot-bad";
    text.textContent = "No providers configured — open Settings";
  }
}

async function loadHistory() {
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

init();
