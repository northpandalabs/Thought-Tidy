const DEFAULT_MODELS = {
  openai: "gpt-4o-mini",
  claude: "claude-haiku-4-5-20251001",
  gemini: "gemini-1.5-flash"
};

const KEY_FIELDS = { openai: "openaiKey", claude: "claudeKey", gemini: "geminiKey" };
const MODEL_FIELDS = { openai: "openaiModel", claude: "claudeModel", gemini: "geminiModel" };

async function init() {
  const settings = await browser.storage.local.get([
    "provider", "variants",
    "openaiKey", "claudeKey", "geminiKey",
    "openaiModel", "claudeModel", "geminiModel"
  ]);

  const providerEl  = document.getElementById("provider");
  const variantsEl  = document.getElementById("variants");
  const variantsVal = document.getElementById("variants-val");

  providerEl.value  = settings.provider || "openai";
  variantsEl.value  = settings.variants  || 1;
  variantsVal.textContent = variantsEl.value;

  updateStatus(settings, providerEl.value);
  updateModelDisplay(settings, providerEl.value);

  providerEl.addEventListener("change", () => {
    browser.storage.local.set({ provider: providerEl.value });
    updateStatus(settings, providerEl.value);
    updateModelDisplay(settings, providerEl.value);
  });

  variantsEl.addEventListener("input", () => {
    variantsVal.textContent = variantsEl.value;
    browser.storage.local.set({ variants: variantsEl.value });
  });

  document.getElementById("open-settings").addEventListener("click", () => {
    browser.runtime.openOptionsPage();
  });
}

function updateStatus(settings, provider) {
  const key  = settings[KEY_FIELDS[provider]];
  const dot  = document.getElementById("key-indicator");
  const text = document.getElementById("key-text");
  if (key) {
    dot.className  = "dot dot-ok";
    text.textContent = "API key set";
  } else {
    dot.className  = "dot dot-bad";
    text.textContent = "No API key — open Settings";
  }
}

function updateModelDisplay(settings, provider) {
  const model = settings[MODEL_FIELDS[provider]] || DEFAULT_MODELS[provider];
  document.getElementById("model-display").textContent = model;
}

init();
