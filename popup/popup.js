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
    "customPrompts",
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

  document.getElementById("process-btn").addEventListener("click", runProcess);

  document.getElementById("copy-result").addEventListener("click", () => {
    const text = document.getElementById("result-text").textContent;
    navigator.clipboard.writeText(text).catch(() => {});
    const btn = document.getElementById("copy-result");
    btn.textContent = "Copied!";
    setTimeout(() => (btn.textContent = "Copy"), 1600);
  });
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

init();
