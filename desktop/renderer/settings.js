// settings.js — Thought Tidy desktop settings renderer
// Shares provider management logic with the extension options.js via the storage shim.
// browser.storage.local calls go through storage-shim.js → btcAPI → electron-store.

/* global browser, btcAPI, costTier, fetchOpenAIModels, fetchClaudeModels, fetchGeminiModels,
          testOpenAI, testClaude, testGemini, uid, escHtml, isModelCacheStale, formatCacheAge */

const STORAGE_KEYS = [
  "configuredProviders", "geminiModels",
  "provider", "openaiKey", "openaiModel", "claudeKey", "claudeModel", "geminiKey", "geminiModel",
  "variants", "customPrompts", "actionSettings",
  "profileName", "profileRole", "profileStyle", "profileContext", "profileEnabled",
  "licenseEmail", "licenseKey", "contextPresets", "contextEnabled", "audienceLevel", "devMode",
  "zoomLevel", "themeMode"
];

const GUMROAD_URL    = "https://northpandalabs.gumroad.com/l/thought-tidy";
const PRO_ACTION_IDS = new Set(["sound-like-me", "improve", "formal", "casual", "shorten", "expand"]);

const FETCHERS = { openai: fetchOpenAIModels, claude: fetchClaudeModels, gemini: fetchGeminiModels };
const TESTERS  = { openai: testOpenAI,        claude: testClaude,        gemini: testGemini };

const PROVIDER_INFO = {
  openai: { name: "ChatGPT (OpenAI)",   sub: "GPT-4o, o1, o3…",     keyPlaceholder: "sk-…",    keyUrl: "https://platform.openai.com/api-keys" },
  claude: { name: "Claude (Anthropic)", sub: "Haiku, Sonnet, Opus…", keyPlaceholder: "sk-ant-…",keyUrl: "https://console.anthropic.com/settings/keys" },
  gemini: { name: "Gemini (Google)",    sub: "2.0 Flash, 1.5 Pro…",  keyPlaceholder: "AIza…",   keyUrl: "https://aistudio.google.com/app/apikey" },
  ollama: { name: "Ollama (Local AI)",  sub: "llama3, mistral, phi4…", keyPlaceholder: "",       keyUrl: "" }
};

// ── In-memory provider state ───────────────────────────────────────────────────

let configuredProviders = [];
let geminiModels        = [null, null, null];
let wizardProvider      = null;
let isDirty             = false;

// ── Wire external links (Electron can't use <a href> target="_blank") ──────────

function wireLinks() {
  const links = {
    "link-github":         "https://github.com/northpandalabs/Thought-Tidy",
    "link-issues":         "https://github.com/northpandalabs/Thought-Tidy/issues",
    "link-author":         "https://github.com/northpandalabs",
    "link-footer-github":  "https://github.com/northpandalabs/Thought-Tidy",
    "link-footer-privacy": "https://raw.githubusercontent.com/northpandalabs/Thought-Tidy/refs/heads/main/legal/privacy.txt",
    "link-footer-eula":    "https://raw.githubusercontent.com/northpandalabs/Thought-Tidy/refs/heads/main/legal/eula.txt"
  };
  for (const [id, url] of Object.entries(links)) {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", () => btcAPI.openURL(url));
  }
}

// ── Storage migration ─────────────────────────────────────────────────────────

async function migrateStorage() {
  const s = await browser.storage.local.get([
    "configuredProviders",
    "provider", "openaiKey", "openaiModel", "claudeKey", "claudeModel", "geminiKey", "geminiModel"
  ]);
  if (s.configuredProviders !== undefined) return;
  const providers = [];
  const active    = s.provider || "openai";
  const order     = [active, ...["openai", "claude", "gemini"].filter(p => p !== active)];
  for (const id of order) {
    const apiKey = s[`${id}Key`];
    if (!apiKey) continue;
    providers.push({ id, apiKey, model: s[`${id}Model`] || "" });
  }
  const gEntry  = providers.find(p => p.id === "gemini");
  const gModels = gEntry ? [gEntry.model || null, null, null] : [null, null, null];
  await browser.storage.local.set({ configuredProviders: providers, geminiModels: gModels });
}

async function saveProviders() {
  await browser.storage.local.set({ configuredProviders, geminiModels });
}

// ── Generic model fetch + select populate ─────────────────────────────────────

async function fetchAndPopulate(providerId, apiKey, { statusEl, selectEls, refreshBtn, currentValues = [] } = {}) {
  if (!apiKey) {
    if (statusEl) { statusEl.textContent = "Enter an API key first."; statusEl.className = "fetch-status status-error"; }
    return null;
  }
  if (refreshBtn) { refreshBtn.disabled = true; refreshBtn.textContent = "Fetching…"; }
  if (statusEl)   { statusEl.textContent = "Fetching models…"; statusEl.className = "fetch-status status-loading"; }

  try {
    const allModels = await FETCHERS[providerId](apiKey);
    if (!allModels.length) throw new Error("No compatible models returned.");
    if (statusEl) { statusEl.textContent = `Testing ${allModels.length} models…`; }

    const results = await Promise.all(allModels.map(async m => (await TESTERS[providerId](apiKey, m.id)) ? m : null));
    const working = results.filter(Boolean);
    if (!working.length) throw new Error("No models responded. Check your API key.");

    const sels = Array.isArray(selectEls) ? selectEls : (selectEls ? [selectEls] : []);
    sels.forEach((sel, i) => {
      if (!sel) return;
      sel.innerHTML = "";
      if (i > 0) {
        const blank = document.createElement("option");
        blank.value = ""; blank.textContent = "— none —";
        sel.appendChild(blank);
      }
      working.forEach(m => {
        const opt = document.createElement("option");
        opt.value = m.id;
        opt.textContent = `${m.label}  ${costTier(m.id)}`;
        sel.appendChild(opt);
      });
      const wanted = currentValues[i];
      sel.value    = (wanted && working.find(m => m.id === wanted)) ? wanted : (i === 0 ? working[0].id : "");
      sel.disabled = false;
    });

    const skipped = allModels.length - working.length;
    if (statusEl) {
      statusEl.textContent = skipped > 0 ? `${working.length}/${allModels.length} models verified` : `${working.length} models verified ✓`;
      statusEl.className   = "fetch-status status-ok";
    }
    return working;
  } catch (err) {
    if (statusEl) { statusEl.textContent = `Error: ${err.message}`; statusEl.className = "fetch-status status-error"; }
    return null;
  } finally {
    if (refreshBtn) { refreshBtn.disabled = false; refreshBtn.textContent = "↻ Refresh"; }
  }
}

// ── Card rendering ─────────────────────────────────────────────────────────────

function renderProviderCards() {
  const container = document.getElementById("provider-cards");
  const noState   = document.getElementById("no-providers-state");
  const addBtn    = document.getElementById("add-provider-btn");
  container.innerHTML = "";

  if (!configuredProviders.length) {
    noState.style.display = "block";
    if (addBtn) addBtn.style.display = "inline-block";
    return;
  }
  noState.style.display = "none";
  if (addBtn) addBtn.style.display = configuredProviders.length < Object.keys(PROVIDER_INFO).length ? "inline-block" : "none";
  configuredProviders.forEach((p, idx) => container.appendChild(buildCard(p, idx)));
}

function buildCard(p, idx) {
  const info   = PROVIDER_INFO[p.id] || { name: p.id, sub: "", keyPlaceholder: "", keyUrl: "#" };
  const isLast = idx === configuredProviders.length - 1;

  let modelHtml = "";
  if (p.id === "gemini") {
    const slots = geminiModels.filter(Boolean);
    modelHtml = slots.length
      ? `<div class="pc-model-list">${slots.map((m, i) => `<span class="pc-model-slot"><span class="pc-slot-label">${["Primary","Secondary","Tertiary"][i]}</span>${m}</span>`).join("")}</div>`
      : `<span class="pc-model-none">No models — click Edit to set</span>`;
  } else if (p.id === "ollama") {
    const baseUrlShort = (p.baseUrl || "localhost:11434").replace(/^https?:\/\//, "");
    modelHtml = `<span class="pc-model">${p.model || "(no model)"} · <small>${baseUrlShort}</small></span>`;
  } else {
    modelHtml = `<span class="pc-model">${p.model || "(default)"}</span>`;
  }

  const upBtn   = idx > 0   ? `<button class="pc-btn pc-up" data-idx="${idx}" title="Move up">↑</button>` : "";
  const downBtn = !isLast   ? `<button class="pc-btn pc-down" data-idx="${idx}" title="Move down">↓</button>` : "";

  let modelEditHtml = "";
  if (p.id === "gemini") {
    modelEditHtml = `
      <div class="field" style="margin-bottom:6px">
        <label>Model Priority <span class="fetch-status pc-model-status"></span></label>
        <button class="pc-btn pc-refresh-btn" style="margin-top:6px">↻ Refresh Model Lists</button>
      </div>
      ${["Primary","Secondary","Tertiary"].map((label, i) => `
        <div class="field">
          <label>${label} Model${i > 0 ? ' <span class="hint">(optional)</span>' : ''}</label>
          <div class="model-select-row">
            <select class="pc-gemini-slot-select" data-slot="${i}" disabled>
              <option value="">${geminiModels[i] || "— click Refresh —"}</option>
            </select>
          </div>
        </div>`).join("")}`;
  } else {
    modelEditHtml = `
      <div class="field">
        <label>Model <span class="fetch-status pc-model-status"></span></label>
        <div class="model-select-row">
          <select class="pc-model-select" disabled>
            <option value="">${p.model || "— click Refresh to load models —"}</option>
          </select>
          <button class="pc-btn pc-refresh-btn">↻ Refresh</button>
        </div>
      </div>`;
  }

  // Build edit panel fields differently for Ollama (no API key)
  const editKeyFieldHtml = p.id === "ollama"
    ? `<div class="field">
        <label>Ollama Base URL</label>
        <input type="text" class="pc-ollama-url-input" value="${p.baseUrl || "http://localhost:11434"}"
               placeholder="http://localhost:11434" autocomplete="off">
        <p class="hint" style="margin-top:4px">Use http://localhost:11434 for local Ollama, or enter a remote address.</p>
       </div>`
    : `<div class="field">
        <label>
          API Key
          <span class="api-link pc-key-link" style="cursor:pointer" data-url="${info.keyUrl}">Get key ↗</span>
        </label>
        <div class="key-row">
          <input type="password" class="pc-key-input" autocomplete="off" placeholder="${info.keyPlaceholder}">
          <button class="show-btn pc-show-btn">Show</button>
          <button class="pc-btn pc-test-btn">Test &amp; Load Models</button>
        </div>
        <div class="fetch-status pc-key-status"></div>
       </div>`;

  const card = document.createElement("div");
  card.className   = "provider-card";
  card.dataset.idx = idx;
  card.innerHTML = `
    <div class="pc-header">
      <div class="pc-info">
        <span class="pc-priority">${idx + 1}</span>
        <div class="pc-names">
          <span class="pc-name">${info.name}</span>
          ${modelHtml}
        </div>
      </div>
      <div class="pc-controls">
        ${upBtn}${downBtn}
        <button class="pc-btn pc-edit-btn" data-idx="${idx}">Edit</button>
      </div>
    </div>
    <div class="pc-edit-panel" style="display:none">
      ${editKeyFieldHtml}
      ${modelEditHtml}
      <div class="pc-edit-actions">
        <button class="pc-btn pc-remove-btn">Remove</button>
        <div style="display:flex;gap:8px">
          <button class="pc-btn pc-cancel-edit-btn">Cancel</button>
          <button class="pc-btn btn-primary pc-save-edit-btn">Save</button>
        </div>
      </div>
    </div>`;

  // Key value + show/hide + test (non-Ollama only)
  if (p.id !== "ollama") {
    card.querySelector(".pc-key-input").value = p.apiKey;
    card.querySelector(".pc-key-link")?.addEventListener("click", () => btcAPI.openURL(info.keyUrl));
    const showBtn  = card.querySelector(".pc-show-btn");
    const keyInput = card.querySelector(".pc-key-input");
    showBtn.addEventListener("click", () => {
      keyInput.type       = keyInput.type === "password" ? "text" : "password";
      showBtn.textContent = keyInput.type === "password" ? "Show" : "Hide";
    });
    card.querySelector(".pc-test-btn").addEventListener("click", async () => {
      const key         = keyInput.value.trim();
      const keyStatusEl = card.querySelector(".pc-key-status");
      if (!key) { keyStatusEl.textContent = "Enter an API key first."; keyStatusEl.className = "fetch-status status-error"; return; }
      if (p.id === "gemini") {
        const sels = [...card.querySelectorAll(".pc-gemini-slot-select")];
        await fetchAndPopulate("gemini", key, { statusEl: card.querySelector(".pc-model-status"), selectEls: sels, currentValues: geminiModels.map(m => m || "") });
        keyStatusEl.textContent = ""; keyStatusEl.className = "fetch-status";
      } else {
        await fetchAndPopulate(p.id, key, { statusEl: card.querySelector(".pc-model-status"), selectEls: [card.querySelector(".pc-model-select")], currentValues: [p.model || ""] });
      }
    });
  }

  // Refresh button
  card.querySelector(".pc-refresh-btn")?.addEventListener("click", async () => {
    if (p.id === "ollama") {
      const baseUrl  = card.querySelector(".pc-ollama-url-input").value.trim() || "http://localhost:11434";
      const statusEl = card.querySelector(".pc-model-status");
      const sel      = card.querySelector(".pc-model-select");
      const btn      = card.querySelector(".pc-refresh-btn");
      if (btn) { btn.disabled = true; btn.textContent = "Fetching…"; }
      statusEl.textContent = "Fetching models…"; statusEl.className = "fetch-status status-loading";
      try {
        const models = await fetchOllamaModels(baseUrl);
        sel.innerHTML = "";
        models.forEach(m => { const opt = document.createElement("option"); opt.value = m.id; opt.textContent = m.label; sel.appendChild(opt); });
        sel.value    = (p.model && models.find(m => m.id === p.model)) ? p.model : (models[0]?.id || "");
        sel.disabled = false;
        statusEl.textContent = `${models.length} model${models.length === 1 ? "" : "s"} found ✓`; statusEl.className = "fetch-status status-ok";
      } catch (err) {
        statusEl.textContent = `Error: ${err.message}`; statusEl.className = "fetch-status status-error";
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = "↻ Refresh"; }
      }
      return;
    }
    const key = card.querySelector(".pc-key-input").value.trim();
    if (p.id === "gemini") {
      await fetchAndPopulate("gemini", key, { statusEl: card.querySelector(".pc-model-status"), refreshBtn: card.querySelector(".pc-refresh-btn"), selectEls: [...card.querySelectorAll(".pc-gemini-slot-select")], currentValues: geminiModels.map(m => m || "") });
    } else {
      await fetchAndPopulate(p.id, key, { statusEl: card.querySelector(".pc-model-status"), refreshBtn: card.querySelector(".pc-refresh-btn"), selectEls: [card.querySelector(".pc-model-select")], currentValues: [p.model || ""] });
    }
  });

  card.querySelector(".pc-up")?.addEventListener("click", () => moveProvider(idx, -1));
  card.querySelector(".pc-down")?.addEventListener("click", () => moveProvider(idx, 1));

  card.querySelector(".pc-edit-btn").addEventListener("click", () => {
    document.querySelectorAll(".pc-edit-panel").forEach(ep => ep.style.display = "none");
    card.querySelector(".pc-edit-panel").style.display = "block";
  });
  card.querySelector(".pc-cancel-edit-btn").addEventListener("click", () => {
    renderProviderCards();
  });
  card.querySelector(".pc-save-edit-btn").addEventListener("click", () => saveCardEdit(card, idx, p));
  card.querySelector(".pc-remove-btn").addEventListener("click", () => confirmRemoveProvider(idx));

  return card;
}

async function saveCardEdit(card, idx, provider) {
  if (provider.id === "ollama") {
    const newUrl   = card.querySelector(".pc-ollama-url-input")?.value?.trim() || "http://localhost:11434";
    const sel      = card.querySelector(".pc-model-select");
    const newModel = (sel && !sel.disabled && sel.value) ? sel.value : provider.model;
    configuredProviders[idx] = { ...provider, baseUrl: newUrl, model: newModel };
    await saveProviders();
    renderProviderCards();
    return;
  }

  const newKey = card.querySelector(".pc-key-input").value.trim();
  if (!newKey) {
    const st = card.querySelector(".pc-key-status");
    st.textContent = "API key is required."; st.className = "fetch-status status-error";
    return;
  }
  configuredProviders[idx] = { ...provider, apiKey: newKey };
  if (provider.id === "gemini") {
    const slots     = [...card.querySelectorAll(".pc-gemini-slot-select")];
    const refreshed = slots.some(s => !s.disabled);
    if (refreshed) {
      geminiModels = slots.map(s => s.value || null);
      configuredProviders[idx].model = geminiModels[0] || "";
    }
  } else {
    const sel = card.querySelector(".pc-model-select");
    if (sel && !sel.disabled && sel.value) configuredProviders[idx].model = sel.value;
  }
  await saveProviders();
  renderProviderCards();
}

function confirmRemoveProvider(idx) {
  const info = PROVIDER_INFO[configuredProviders[idx].id] || { name: configuredProviders[idx].id };
  if (!confirm(`Remove ${info.name}? Your API key for this provider will be deleted.`)) return;
  configuredProviders.splice(idx, 1);
  if (!configuredProviders.find(p => p.id === "gemini")) geminiModels = [null, null, null];
  saveProviders().then(() => renderProviderCards());
}

function moveProvider(idx, dir) {
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= configuredProviders.length) return;
  [configuredProviders[idx], configuredProviders[newIdx]] = [configuredProviders[newIdx], configuredProviders[idx]];
  saveProviders().then(() => renderProviderCards());
}

// ── Wizard ─────────────────────────────────────────────────────────────────────

function showWizard() {
  wizardProvider = null;
  document.getElementById("provider-wizard").style.display  = "block";
  document.getElementById("wizard-step-1").style.display    = "block";
  document.getElementById("wizard-step-2").style.display    = "none";
  document.getElementById("add-provider-btn").style.display = "none";
  clearWizardStep2();
}

function hideWizard() {
  document.getElementById("provider-wizard").style.display  = "none";
  document.getElementById("add-provider-btn").style.display = "inline-block";
  wizardProvider = null;
}

function clearWizardStep2() {
  document.getElementById("wizard-api-key").value           = "";
  document.getElementById("wizard-key-status").textContent  = "";
  document.getElementById("wizard-model-status").textContent= "";
  const sel = document.getElementById("wizard-model-select");
  sel.innerHTML = "<option value=''>— test your key above to load models —</option>"; sel.disabled = true;
  const g2 = document.getElementById("wizard-gemini-model-2");
  const g3 = document.getElementById("wizard-gemini-model-3");
  if (g2) { g2.innerHTML = "<option value=''>— none —</option>"; g2.disabled = true; }
  if (g3) { g3.innerHTML = "<option value=''>— none —</option>"; g3.disabled = true; }
  const ollamaUrl = document.getElementById("wizard-ollama-url");
  if (ollamaUrl) ollamaUrl.value = "http://localhost:11434";
}

function showWizardStep2(providerId) {
  wizardProvider = providerId;
  const info     = PROVIDER_INFO[providerId];
  const isOllama = providerId === "ollama";

  document.getElementById("wizard-provider-title").textContent = info.name;
  document.getElementById("wizard-api-key").placeholder        = info.keyPlaceholder;
  document.getElementById("wizard-api-key-row").style.display  = isOllama ? "none" : "";
  document.getElementById("wizard-gemini-extra").style.display = providerId === "gemini" ? "block" : "none";
  document.getElementById("wizard-ollama-extra").style.display = isOllama ? "block" : "none";
  document.getElementById("wizard-test-btn").textContent       = isOllama ? "Fetch Models" : "Test & Load Models";
  document.getElementById("wizard-key-status").textContent     = "";

  // Wire the "Get key" link via btcAPI (only relevant for non-Ollama)
  const keyLink = document.getElementById("wizard-key-link");
  if (keyLink && !isOllama) {
    keyLink.onclick = null;
    keyLink.addEventListener("click", () => btcAPI.openURL(info.keyUrl));
  }

  document.getElementById("wizard-step-1").style.display = "none";
  document.getElementById("wizard-step-2").style.display = "block";
  if (isOllama) document.getElementById("wizard-ollama-url").focus();
  else          document.getElementById("wizard-api-key").focus();
}

async function wizardTestAndLoad() {
  if (!wizardProvider) return;

  // Ollama: fetch models directly from /api/tags — no API key, no permission check needed on desktop
  if (wizardProvider === "ollama") {
    const baseUrl  = document.getElementById("wizard-ollama-url").value.trim() || "http://localhost:11434";
    const statusEl = document.getElementById("wizard-key-status");
    const modelSt  = document.getElementById("wizard-model-status");
    const sel      = document.getElementById("wizard-model-select");
    modelSt.textContent = "Fetching models…"; modelSt.className = "fetch-status status-loading";
    statusEl.textContent = ""; statusEl.className = "fetch-status";
    try {
      const models = await fetchOllamaModels(baseUrl);
      sel.innerHTML = "";
      models.forEach(m => { const opt = document.createElement("option"); opt.value = m.id; opt.textContent = m.label; sel.appendChild(opt); });
      sel.disabled        = false;
      modelSt.textContent = `${models.length} model${models.length === 1 ? "" : "s"} found ✓`;
      modelSt.className   = "fetch-status status-ok";
      statusEl.textContent = "Ready ✓"; statusEl.className = "fetch-status status-ok";
    } catch (err) {
      modelSt.textContent = `Error: ${err.message}`; modelSt.className = "fetch-status status-error";
    }
    return;
  }

  const apiKey   = document.getElementById("wizard-api-key").value.trim();
  const statusEl = document.getElementById("wizard-key-status");
  if (!apiKey) { statusEl.textContent = "Enter an API key first."; statusEl.className = "fetch-status status-error"; return; }

  const sel1 = document.getElementById("wizard-model-select");
  const sel2 = document.getElementById("wizard-gemini-model-2");
  const sel3 = document.getElementById("wizard-gemini-model-3");
  const sels = wizardProvider === "gemini" ? [sel1, sel2, sel3] : [sel1];

  const working = await fetchAndPopulate(wizardProvider, apiKey, {
    statusEl: document.getElementById("wizard-model-status"),
    selectEls: sels,
    currentValues: []
  });
  if (working) { statusEl.textContent = "Key valid ✓"; statusEl.className = "fetch-status status-ok"; }
  else         { statusEl.textContent = "Key validation failed. Check key and retry."; statusEl.className = "fetch-status status-error"; }
}

async function saveWizardProvider() {
  const statusEl = document.getElementById("wizard-key-status");

  // Ollama: no API key — save baseUrl + model directly
  if (wizardProvider === "ollama") {
    if (configuredProviders.find(p => p.id === "ollama")) {
      statusEl.textContent = "Ollama is already configured. Use Edit on its card to update it.";
      statusEl.className   = "fetch-status status-error";
      return;
    }
    const baseUrl = document.getElementById("wizard-ollama-url").value.trim() || "http://localhost:11434";
    const model   = document.getElementById("wizard-model-select").value || "";
    configuredProviders.push({ id: "ollama", apiKey: "", model, baseUrl });
    await saveProviders();
    hideWizard();
    renderProviderCards();
    return;
  }

  const apiKey = document.getElementById("wizard-api-key").value.trim();
  if (!apiKey) { statusEl.textContent = "Enter an API key first."; statusEl.className = "fetch-status status-error"; return; }

  if (configuredProviders.find(p => p.id === wizardProvider)) {
    const name = PROVIDER_INFO[wizardProvider]?.name || wizardProvider;
    statusEl.textContent = `${name} is already configured. Use Edit on its card to update it.`;
    statusEl.className   = "fetch-status status-error";
    return;
  }

  const model = document.getElementById("wizard-model-select").value || "";
  configuredProviders.push({ id: wizardProvider, apiKey, model });
  if (wizardProvider === "gemini") {
    geminiModels[0] = model || null;
    geminiModels[1] = document.getElementById("wizard-gemini-model-2")?.value || null;
    geminiModels[2] = document.getElementById("wizard-gemini-model-3")?.value || null;
  }
  await saveProviders();
  hideWizard();
  renderProviderCards();
}

// ── Action Settings Editor ─────────────────────────────────────────────────────

let actionSettings = [];
let currentIsPro = false;

function renderActionEditor() {
  const list = document.getElementById("action-list");
  if (!list) return;
  list.innerHTML = "";
  const enabledCount = actionSettings.filter(a => a.enabled).length;

  // Populate the quick-select dropdown
  const quickSel = document.getElementById("action-quick-select");
  if (quickSel) {
    const prev = quickSel.value;
    quickSel.innerHTML = '<option value="">— choose an action —</option>';
    actionSettings.forEach(a => {
      const opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = a.label + (a.enabled ? "" : " (disabled)");
      quickSel.appendChild(opt);
    });
    if (prev) quickSel.value = prev;
  }

  const freeActs = actionSettings.filter(a => !PRO_ACTION_IDS.has(a.id));
  const proActs  = actionSettings.filter(a =>  PRO_ACTION_IDS.has(a.id));
  const toRender = currentIsPro ? actionSettings : [...freeActs, ...proActs];

  let dividerInserted = false;

  toRender.forEach((action) => {
    const realIdx    = actionSettings.indexOf(action);
    const isLocked   = LOCKED_ACTIONS.has(action.id);
    const isOnlyOne  = action.enabled && enabledCount === 1;
    const isProAction = PRO_ACTION_IDS.has(action.id);

    // Insert divider before first Pro action for free users
    if (!currentIsPro && isProAction && !dividerInserted && proActs.length > 0) {
      dividerInserted = true;
      const divider = document.createElement("div");
      divider.className = "ae-pro-divider";
      divider.style.cssText = "font-size:11px; color:#6c7086; padding:4px 0; margin:4px 0; border-top:1px solid #313244; text-align:center;";
      divider.textContent = "— Pro features (upgrade to reorder) —";
      list.appendChild(divider);
    }

    const row = document.createElement("div");
    row.className = `ae-row${!action.enabled ? " ae-disabled" : ""}`;
    row.dataset.actionId = action.id;

    let upDisabled, dnDisabled, upTitle, dnTitle;
    if (!currentIsPro && isProAction) {
      upDisabled = true; dnDisabled = true;
      upTitle = "Pro feature — upgrade to reorder Pro actions";
      dnTitle = "Pro feature — upgrade to reorder Pro actions";
    } else if (!currentIsPro) {
      const freeIdx = freeActs.indexOf(action);
      upDisabled = freeIdx === 0;
      dnDisabled = freeIdx === freeActs.length - 1;
      upTitle = "Move up"; dnTitle = "Move down";
    } else {
      upDisabled = realIdx === 0;
      dnDisabled = realIdx === actionSettings.length - 1;
      upTitle = "Move up"; dnTitle = "Move down";
    }

    const ordHtml = `
      <div class="ae-order">
        <button class="ae-ord-btn ae-up" ${upDisabled ? "disabled" : ""} title="${upTitle}">▲</button>
        <button class="ae-ord-btn ae-dn" ${dnDisabled ? "disabled" : ""} title="${dnTitle}">▼</button>
      </div>`;
    const checkDisabled = isOnlyOne || !currentIsPro;
    const checkTitle = isOnlyOne ? "At least one action must stay enabled" : (!currentIsPro ? "Pro feature — upgrade to enable/disable actions" : "");
    const checkHtml = `<input type="checkbox" class="ae-check" ${action.enabled ? "checked" : ""}
      ${checkDisabled ? `disabled title="${checkTitle}"` : ""}>`;
    const labelHtml = isLocked
      ? `<span class="ae-label">${escHtml(action.label)}</span><span class="ae-lock-badge">built-in</span>`
      : `<input class="ae-name-input" value="${escHtml(action.label)}" placeholder="Action name"${!currentIsPro ? " readonly title='Pro feature — upgrade to rename actions'" : ""}><span class="ae-lock-badge"></span>`;

    row.innerHTML = ordHtml + checkHtml + labelHtml;

    row.querySelector(".ae-up").addEventListener("click", () => {
      if (currentIsPro) {
        if (realIdx > 0) { [actionSettings[realIdx - 1], actionSettings[realIdx]] = [actionSettings[realIdx], actionSettings[realIdx - 1]]; renderActionEditor(); }
      } else {
        const freeIdx = freeActs.indexOf(action);
        if (freeIdx > 0) {
          const prevReal = actionSettings.indexOf(freeActs[freeIdx - 1]);
          [actionSettings[prevReal], actionSettings[realIdx]] = [actionSettings[realIdx], actionSettings[prevReal]];
          renderActionEditor();
        }
      }
    });
    row.querySelector(".ae-dn").addEventListener("click", () => {
      if (currentIsPro) {
        if (realIdx < actionSettings.length - 1) { [actionSettings[realIdx], actionSettings[realIdx + 1]] = [actionSettings[realIdx + 1], actionSettings[realIdx]]; renderActionEditor(); }
      } else {
        const freeIdx = freeActs.indexOf(action);
        if (freeIdx < freeActs.length - 1) {
          const nextReal = actionSettings.indexOf(freeActs[freeIdx + 1]);
          [actionSettings[realIdx], actionSettings[nextReal]] = [actionSettings[nextReal], actionSettings[realIdx]];
          renderActionEditor();
        }
      }
    });
    row.querySelector(".ae-check").addEventListener("change", (e) => {
      if (!e.target.checked && actionSettings.filter(a => a.enabled).length <= 1) {
        e.target.checked = true; return;
      }
      actionSettings[realIdx].enabled = e.target.checked;
      renderActionEditor();
    });
    if (!isLocked) {
      row.querySelector(".ae-name-input").addEventListener("input", (e) => {
        actionSettings[realIdx].label = e.target.value;
      });
    }
    list.appendChild(row);
  });
}

// ── Custom prompts ─────────────────────────────────────────────────────────────

let customPrompts = [];

function renderCustomPrompts() {
  const promptSel = document.getElementById("prompt-quick-select");
  if (promptSel) {
    const curVal = promptSel.value;
    promptSel.innerHTML = '<option value="">— Add new prompt —</option>';
    const sep1 = document.createElement("option");
    sep1.disabled = true; sep1.textContent = "── Built-in ──";
    promptSel.appendChild(sep1);
    DEFAULT_ACTION_SETTINGS.forEach(a => {
      const opt = document.createElement("option");
      opt.value    = "builtin-" + a.id;
      const isLocked = LOCKED_ACTIONS.has(a.id);
      opt.textContent = (isLocked ? "🔒 " : "") + a.label + (!currentIsPro && !isLocked ? " (Pro)" : "");
      promptSel.appendChild(opt);
    });
    if (customPrompts.length) {
      const sep2 = document.createElement("option");
      sep2.disabled = true; sep2.textContent = "── Custom ──";
      promptSel.appendChild(sep2);
      customPrompts.forEach((p, i) => {
        const opt = document.createElement("option");
        opt.value = "custom-" + i;
        if (!currentIsPro) { opt.textContent = p.name + " (Pro)"; opt.disabled = true; }
        else                { opt.textContent = p.name; }
        promptSel.appendChild(opt);
      });
    }
    const restorable = promptSel.querySelector(`option[value="${curVal}"]:not([disabled])`);
    promptSel.value = restorable ? curVal : "";
  }

  const list = document.getElementById("custom-prompts-list");
  list.textContent = "";
  if (!customPrompts.length) {
    const p = document.createElement("p");
    p.className = "no-prompts hint"; p.textContent = "No custom prompts yet — add one below.";
    list.appendChild(p); return;
  }
  customPrompts.forEach((p, i) => {
    const nameSpan  = document.createElement("span"); nameSpan.className = "cp-name"; nameSpan.textContent = p.name;
    if (p.clarify) { const badge = document.createElement("span"); badge.className = "cp-clarify-badge"; badge.textContent = "clarify"; nameSpan.appendChild(badge); }
    const orderSpan = document.createElement("span"); orderSpan.className = "cp-order"; orderSpan.textContent = `#${i + 1} in menu`;
    const meta = document.createElement("div"); meta.className = "cp-meta"; meta.append(nameSpan, orderSpan);
    const textDiv = document.createElement("div"); textDiv.className = "cp-text";
    textDiv.textContent = p.prompt.length > 100 ? p.prompt.slice(0, 100) + "…" : p.prompt;
    const mkBtn = (cls, label) => { const btn = document.createElement("button"); btn.className = `cp-btn ${cls}`; btn.dataset.id = p.id; btn.textContent = label; return btn; };
    const actions = document.createElement("div"); actions.className = "cp-actions";
    if (currentIsPro) {
      actions.append(mkBtn("cp-edit", "Edit"), mkBtn("cp-delete", "Delete"));
      if (i > 0)                        actions.appendChild(mkBtn("cp-up",   "↑"));
      if (i < customPrompts.length - 1) actions.appendChild(mkBtn("cp-down", "↓"));
    } else {
      const hint = document.createElement("span");
      hint.className = "cp-pro-hint";
      hint.textContent = "Upgrade to Pro to edit";
      actions.appendChild(hint);
    }
    const item = document.createElement("div"); item.className = "cp-item"; item.dataset.id = p.id;
    item.append(meta, textDiv, actions); list.appendChild(item);
  });
  if (currentIsPro) {
    list.querySelectorAll(".cp-delete").forEach(btn => btn.addEventListener("click", async () => { customPrompts = customPrompts.filter(p => p.id !== btn.dataset.id); await browser.storage.local.set({ customPrompts }); renderCustomPrompts(); }));
    list.querySelectorAll(".cp-edit").forEach(btn => btn.addEventListener("click", () => {
      const p = customPrompts.find(x => x.id === btn.dataset.id); if (!p) return;
      document.getElementById("new-prompt-name").value = p.name;
      document.getElementById("new-prompt-text").value = p.prompt;
      customPrompts = customPrompts.filter(x => x.id !== p.id); renderCustomPrompts();
      document.getElementById("add-prompt-form").scrollIntoView({ behavior: "smooth" });
    }));
    list.querySelectorAll(".cp-up").forEach(btn => btn.addEventListener("click", () => {
      const idx = customPrompts.findIndex(p => p.id === btn.dataset.id);
      if (idx > 0) { [customPrompts[idx - 1], customPrompts[idx]] = [customPrompts[idx], customPrompts[idx - 1]]; renderCustomPrompts(); }
    }));
    list.querySelectorAll(".cp-down").forEach(btn => btn.addEventListener("click", () => {
      const idx = customPrompts.findIndex(p => p.id === btn.dataset.id);
      if (idx < customPrompts.length - 1) { [customPrompts[idx], customPrompts[idx + 1]] = [customPrompts[idx + 1], customPrompts[idx]]; renderCustomPrompts(); }
    }));
  }

  const addForm = document.getElementById("add-prompt-form");
  if (addForm) {
    const hasBasic   = customPrompts.some(p => !p.clarify);
    const hasClarify = customPrompts.some(p =>  p.clarify);
    const freeIsFull = hasBasic && hasClarify;
    const isFull     = currentIsPro ? customPrompts.length >= 8 : freeIsFull;
    addForm.style.display = isFull ? "none" : "";

    const clarifyEl = document.getElementById("prompt-clarify");
    if (!currentIsPro && clarifyEl && !isFull) {
      if (!hasBasic && !hasClarify) {
        clarifyEl.disabled = false;
      } else if (!hasBasic) {
        clarifyEl.checked = false; clarifyEl.disabled = true;
      } else {
        clarifyEl.checked = true; clarifyEl.disabled = true;
      }
    } else if (clarifyEl) {
      clarifyEl.disabled = false;
    }

    let warn = document.getElementById("free-prompt-warning");
    if (!currentIsPro && addForm.style.display !== "none") {
      if (!warn) {
        warn = document.createElement("p");
        warn.id = "free-prompt-warning";
        warn.style.cssText = "color:#f9e2af; background:rgba(249,226,175,0.07); border:1px solid rgba(249,226,175,0.18); border-radius:6px; padding:8px 10px; margin-bottom:12px; font-size:12px; line-height:1.5;";
        addForm.insertBefore(warn, addForm.firstChild);
      }
      warn.textContent = "⚠ Free tier: you get 1 basic prompt and 1 clarify prompt. Once added they are permanent — upgrade to Pro to edit or add more.";
      warn.style.display = "block";
    } else if (warn) {
      warn.style.display = "none";
    }
  }
}

async function addPrompt() {
  const name      = document.getElementById("new-prompt-name").value.trim();
  const prompt    = document.getElementById("new-prompt-text").value.trim();
  const isClarify = document.getElementById("prompt-clarify")?.checked || false;
  if (!name || !prompt) { alert("Enter both a name and an instruction."); return; }
  const addBtn = document.getElementById("add-prompt-btn");
  const editId = addBtn?.dataset.editId;
  if (editId) {
    if (!currentIsPro) return;
    const idx = customPrompts.findIndex(p => p.id === editId);
    if (idx !== -1) customPrompts[idx] = { ...customPrompts[idx], name, prompt, clarify: isClarify };
    delete addBtn.dataset.editId;
    addBtn.textContent = "Add to Menu";
    document.getElementById("add-prompt-title").textContent = "Add New Prompt";
    document.getElementById("delete-prompt-btn").style.display = "none";
    document.getElementById("prompt-quick-select").value = "";
  } else {
    if (!currentIsPro) {
      const hasBasic   = customPrompts.some(p => !p.clarify);
      const hasClarify = customPrompts.some(p =>  p.clarify);
      if (isClarify && hasClarify)  { alert("Free tier: you already have a clarify prompt. Upgrade to Pro to add more."); return; }
      if (!isClarify && hasBasic)   { alert("Free tier: you already have a basic prompt. Upgrade to Pro to add more."); return; }
    } else if (customPrompts.length >= 8) {
      alert("Maximum 8 custom prompts.");
      return;
    }
    customPrompts.push({ id: uid(), name, prompt, clarify: isClarify });
  }
  await browser.storage.local.set({ customPrompts });
  renderCustomPrompts();
  document.getElementById("new-prompt-name").value = "";
  document.getElementById("new-prompt-text").value = "";
  const clarifyEl = document.getElementById("prompt-clarify");
  if (clarifyEl) clarifyEl.checked = true;
}

// ── History viewer ─────────────────────────────────────────────────────────────

async function loadHistoryViewer() {
  const stored = await browser.storage.local.get(["historyFull", "historyLog", "licenseEmail", "licenseKey"]);
  const today  = todayDate();
  // historyFull is the rich log written by the desktop app; fall back to historyLog
  const full   = stored.historyFull || [];
  const legacy = stored.historyLog  || [];
  const allEntries = full.length ? full : legacy;
  const entries = allEntries.filter(e => e.date === today);

  const section = document.getElementById("history-viewer-section");
  if (!section) return;

  document.getElementById("history-viewer-count").textContent = entries.length;
  if (!entries.length) { section.style.display = "none"; return; }
  section.style.display = "";

  const list = document.getElementById("history-viewer-list");
  list.innerHTML = "";
  [...entries].reverse().forEach(e => {
    const t    = new Date(e.timestamp);
    const time = `${String(t.getHours()).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")}`;
    const inT  = e.inputTokens  ?? e.inputLen  ?? 0;
    const outT = e.outputTokens ?? e.outputLen ?? 0;
    const row  = document.createElement("div");
    row.className = "hv-entry";
    row.innerHTML = `
      <span class="hv-time">${time}</span>
      <span class="hv-action">${(e.action || "").replace(/-/g, " ")}</span>
      <span class="hv-meta">${[e.provider, e.model].filter(Boolean).join(" · ")}</span>
      <span class="hv-words">${inT} → ${outT}</span>`;
    list.appendChild(row);
  });

  document.getElementById("history-clear-btn")?.addEventListener("click", async () => {
    if (!confirm("Clear all of today's history?")) return;
    const { historyFull: hf = [], historyLog: hl = [] } = await browser.storage.local.get(["historyFull", "historyLog"]);
    await browser.storage.local.set({
      historyFull: hf.filter(e => e.date !== today),
      historyLog:  hl.filter(e => e.date !== today),
    });
    document.getElementById("history-viewer-count").textContent = "0";
    section.style.display = "none";
  }, { once: true });
}

// ── Per-section saves ──────────────────────────────────────────────────────────

function showSaveStatus(elId, msg) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  setTimeout(() => { el.textContent = ""; }, 2000);
}

async function saveProfile() {
  await browser.storage.local.set({
    profileName:    getVal("profileName"),
    profileRole:    getVal("profileRole"),
    profileStyle:   getVal("profileStyle"),
    profileContext: getVal("profileContext"),
    profileEnabled: document.getElementById("profileEnabled")?.checked || false,
  });
  showSaveStatus("profile-save-status", "Saved!");
}

async function saveBehavior() {
  if (typeof btcAPI !== "undefined" && btcAPI.setLoginItemEnabled) {
    const atLogin = document.getElementById("launchAtLogin")?.checked || false;
    await btcAPI.setLoginItemEnabled(atLogin);
  }
  showSaveStatus("behavior-save-status", "Saved!");
}

async function saveContext() {
  const contextEnabled = document.getElementById("contextEnabled")?.checked !== false;
  await browser.storage.local.set({ contextEnabled });
  showSaveStatus("context-save-status", "Saved!");
}

async function saveActionOrder() {
  const { lastAction = "" } = await browser.storage.local.get("lastAction");
  const enabledIds = new Set(actionSettings.filter(a => a.enabled).map(a => a.id));
  if (lastAction && !lastAction.startsWith("custom-") && !enabledIds.has(lastAction)) {
    const first = actionSettings.find(a => a.enabled);
    await browser.storage.local.set({ lastAction: first?.id || "" });
  }
  await browser.storage.local.set({ actionSettings });
  showSaveStatus("actions-save-status", "Saved!");
}

// ── Save / revert ──────────────────────────────────────────────────────────────

async function save() {
  // Check if the user's last-used action was disabled — reset if needed
  const { lastAction = "" } = await browser.storage.local.get("lastAction");
  const enabledIds   = new Set(actionSettings.filter(a => a.enabled).map(a => a.id));
  let resetMsg       = "";
  let resolvedAction = lastAction;
  if (lastAction && !lastAction.startsWith("custom-") && !enabledIds.has(lastAction)) {
    const first    = actionSettings.find(a => a.enabled);
    resolvedAction = first?.id || "";
    resetMsg       = ` Note: your last action was disabled. Switched to "${first?.label || resolvedAction}".`;
    await browser.storage.local.set({ lastAction: resolvedAction });
  }

  await browser.storage.local.set({
    customPrompts,
    actionSettings,
    profileName:    getVal("profileName"),
    profileRole:    getVal("profileRole"),
    profileStyle:   getVal("profileStyle"),
    profileContext: getVal("profileContext"),
    profileEnabled: document.getElementById("profileEnabled")?.checked || false
  });
  isDirty = false;
  const status = document.getElementById("save-status");
  status.textContent = "Saved!" + resetMsg;
  status.className   = "status-ok";
  setTimeout(() => { status.textContent = ""; }, resetMsg ? 5000 : 2000);
}

function getVal(id) { return document.getElementById(id)?.value ?? ""; }
function setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v; }

// ── Pro gate ───────────────────────────────────────────────────────────────────

function applyProGates(isPro) {
  currentIsPro = isPro;
  ["profile-section", "history-viewer-section", "context-presets-section"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle("locked", !isPro);
  });
  // Show history section only when Pro (it starts display:none)
  const histEl = document.getElementById("history-viewer-section");
  if (histEl) histEl.style.display = isPro ? "" : "none";
  renderActionEditor();
  renderCustomPrompts();

  const lockedView = document.getElementById("pro-locked-view");
  const activeView = document.getElementById("pro-active-view");
  if (lockedView) lockedView.style.display = isPro ? "none" : "";
  if (activeView) activeView.style.display = isPro ? ""     : "none";

  // Hide PRO badges when activated
  document.querySelectorAll(".pro-badge-sm").forEach(el => {
    el.style.display = isPro ? "none" : "";
  });

  // Update pro button text
  const proBtn = document.getElementById("activate-pro-link-btn");
  if (proBtn) proBtn.textContent = isPro ? "✓ Activated" : "⚡ Activate Pro";

  // History title and hint
  const histTitle = document.getElementById("history-title-text");
  if (histTitle) histTitle.textContent = isPro ? "All History" : "Today's History";
  const histFreeHint = document.getElementById("history-free-hint");
  if (histFreeHint) histFreeHint.style.display = isPro ? "none" : "block";
  document.getElementById("history-upgrade-link")?.addEventListener("click", () => btcAPI.openURL(GUMROAD_URL));

  // Ollama is Pro-only — disable its wizard button for non-Pro users
  const ollamaBtn = document.querySelector('.wizard-provider-btn[data-provider="ollama"]');
  if (ollamaBtn) {
    ollamaBtn.disabled = !isPro;
    ollamaBtn.title    = isPro ? "" : "Pro feature. Unlock Pro to use Ollama.";
  }

  // Seed 3 default audience presets the first time Pro is activated
  if (isPro && !contextPresets.length) {
    contextPresets = DEFAULT_AUDIENCE_PRESETS.map(p => ({ ...p, id: uid() }));
    browser.storage.local.set({ contextPresets });
    renderContextPresets();
  }
}

function initProSection() {
  browser.storage.local.get(["licenseEmail", "licenseKey"]).then(s => {
    const isPro = isProUnlocked(s);
    applyProGates(isPro);
    if (isPro) {
      const emailEl = document.getElementById("pro-active-email");
      if (emailEl) emailEl.textContent = s.licenseEmail;
    }
  });

  document.getElementById("pro-buy-link")?.addEventListener("click", () => {
    btcAPI.openURL("https://northpandalabs.gumroad.com/l/thought-tidy");
  });

  document.querySelectorAll(".pro-unlock-link").forEach(a => {
    a.addEventListener("click", () => {
      const panel = document.getElementById("pro-panel");
      if (panel) panel.style.display = "block";
    });
  });

  document.getElementById("activate-pro-btn")?.addEventListener("click", async () => {
    const email  = document.getElementById("pro-email-input")?.value?.trim();
    const key    = document.getElementById("pro-key-input")?.value?.trim();
    const msgEl  = document.getElementById("pro-status-msg");
    const btn    = document.getElementById("activate-pro-btn");
    if (!email || !key) { msgEl.textContent = "Enter your email and license key."; msgEl.className = "pro-status-msg error"; return; }
    btn.disabled    = true;
    btn.textContent = "Verifying…";
    msgEl.textContent = ""; msgEl.className = "pro-status-msg";
    const result = await verifyWithGumroad(email, key);
    btn.disabled    = false;
    btn.textContent = "Activate";
    if (!result.valid) { msgEl.textContent = result.error; msgEl.className = "pro-status-msg error"; return; }
    await browser.storage.local.set({ licenseEmail: email, licenseKey: key });
    const emailEl = document.getElementById("pro-active-email");
    if (emailEl) emailEl.textContent = email;
    applyProGates(true);
    const panel = document.getElementById("pro-panel");
    if (panel) panel.style.display = "none";
  });

  document.getElementById("deactivate-pro-btn")?.addEventListener("click", async () => {
    await browser.storage.local.remove(["licenseEmail", "licenseKey"]);
    document.getElementById("pro-email-input").value = "";
    document.getElementById("pro-key-input").value   = "";
    applyProGates(false);
    const panel = document.getElementById("pro-panel");
    if (panel) panel.style.display = "none";
  });
}

// ── Context Presets ────────────────────────────────────────────────────────────

let contextPresets = [];

const DEFAULT_AUDIENCE_PRESETS = [
  { name: "Casual Reader",    text: "Write for a casual reader. Use friendly, everyday language — simple, clear, and conversational. Avoid jargon." },
  { name: "Professional",     text: "Write for a professional audience. Use polished, industry-standard language and an authoritative tone." },
  { name: "Technical Expert", text: "Write for a technical expert. Be precise and concise — skip basic explanations and use specialized terminology freely." },
];

const ASSUMPTION_LABELS = [
  "", "1 — Beginner", "2 — Beginner", "3 — Basic", "4 — Basic",
  "5 — Moderate", "6 — Moderate", "7 — Knowledgeable", "8 — Knowledgeable",
  "9 — Expert", "10 — Expert"
];

function renderContextPresets() {
  const list = document.getElementById("context-presets-list");
  if (!list) return;
  list.innerHTML = "";

  // Populate the quick-select dropdown
  const quickSel = document.getElementById("context-preset-quick-select");
  if (quickSel) {
    quickSel.innerHTML = '<option value="">— add new below —</option>';
    contextPresets.forEach((p, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = p.name;
      quickSel.appendChild(opt);
    });
  }

}

function setCpLevel(level) {
  document.querySelectorAll(".cp-level-btn").forEach(btn => {
    const on = btn.dataset.level === (level || "intermediate");
    btn.style.background = on ? "var(--accent)"  : "var(--bg-card)";
    btn.style.color      = on ? "var(--bg-card)" : "var(--text-dim)";
    btn.style.fontWeight = on ? "700" : "400";
  });
}
function getCpLevel() {
  return document.querySelector(".cp-level-btn[style*='var(--accent)']")?.dataset.level
      || document.querySelector(".cp-level-btn[style*='#89b4fa']")?.dataset.level
      || "intermediate";
}

async function addContextPreset() {
  const name    = document.getElementById("new-cpreset-name")?.value?.trim();
  const text    = document.getElementById("new-cpreset-text")?.value?.trim();
  const level   = getCpLevel();
  const saveBtn = document.getElementById("add-context-preset-btn");
  const editIdx = saveBtn?.dataset.editIdx;
  if (!name || !text) { alert("Enter both a name and a description."); return; }

  if (editIdx !== undefined && editIdx !== "") {
    const idx = parseInt(editIdx);
    contextPresets[idx] = { ...contextPresets[idx], name, text, level };
    delete saveBtn.dataset.editIdx;
    saveBtn.textContent = "Add";
  } else {
    contextPresets.push({ id: uid(), name, text, level });
  }
  await browser.storage.local.set({ contextPresets });
  document.getElementById("new-cpreset-name").value = "";
  document.getElementById("new-cpreset-text").value = "";
  const quickSel = document.getElementById("context-preset-quick-select");
  setCpLevel("intermediate");
  if (quickSel) quickSel.value = "";
  const delBtn = document.getElementById("delete-context-preset-btn");
  if (delBtn) delBtn.style.display = "none";
  renderContextPresets();
}

// ── Init ───────────────────────────────────────────────────────────────────────

async function init() {
  wireLinks();
  const _yr = new Date().getFullYear();
  document.getElementById("copyright-year").textContent = _yr > 2026 ? `2026–${_yr}` : "2026";

  // TEST ONLY banner + version label + update notice via IPC
  if (typeof btcAPI !== "undefined" && btcAPI.getAppConfig) {
    const config = await btcAPI.getAppConfig();
    if (config.isTestBuild) {
      window.__BTC_TEST_BUILD__ = true;
      const banner = document.getElementById("test-only-banner");
      if (banner) banner.style.display = "block";
    }
    if (config.appVersion) {
      const el = document.getElementById("app-version-label");
      if (el) {
        const [base, hash] = config.appVersion.split("+");
        el.textContent = hash ? `v${base} (dev ${hash})` : `v${base}`;
      }
    }
    if (config.updateAvailable?.version) {
      const notice = document.getElementById("update-notice");
      const link   = document.getElementById("update-link");
      if (notice && link) {
        link.textContent = `Version ${config.updateAvailable.version} available. Download from GitHub ↗`;
        link.addEventListener("click", () => btcAPI.openURL(config.updateAvailable.url));
        notice.style.display = "block";
      }
    }

    // Launch-at-login — load actual OS state
    try {
      const atLogin = await btcAPI.getLoginItemEnabled();
      const el = document.getElementById("launchAtLogin");
      if (el) el.checked = !!atLogin;
    } catch {}
  }

  await migrateStorage();
  const s = await browser.storage.local.get(STORAGE_KEYS);
  configuredProviders = s.configuredProviders || [];
  geminiModels        = s.geminiModels || [null, null, null];

  renderProviderCards();

  // Wizard wiring
  document.getElementById("add-provider-btn").addEventListener("click", showWizard);

  // Secret dev mode: open + Add Provider 5 times within 10 seconds to toggle
  let _devClicks = [];
  document.getElementById("add-provider-btn").addEventListener("click", async () => {
    const now = Date.now();
    _devClicks = _devClicks.filter(t => now - t < 10000);
    _devClicks.push(now);
    if (_devClicks.length >= 5) {
      _devClicks = [];
      const { devMode: cur } = await browser.storage.local.get("devMode");
      const next = !cur;
      await browser.storage.local.set({ devMode: next });
      const toast = document.createElement("div");
      toast.textContent = next ? "🛠 Developer mode enabled" : "Developer mode disabled";
      toast.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#313244;color:#cdd6f4;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.5);pointer-events:none;";
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2500);
    }
  });

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
    wzKey.type        = wzKey.type === "password" ? "text" : "password";
    wzShow.textContent = wzKey.type === "password" ? "Show" : "Hide";
  });

  document.getElementById("activate-pro-link-btn")?.addEventListener("click", () => {
    const panel = document.getElementById("pro-panel");
    if (!panel) return;
    // Close display panel if open
    const displayPanel = document.getElementById("display-panel");
    if (displayPanel) displayPanel.style.display = "none";
    panel.style.display = panel.style.display === "none" ? "block" : "none";
  });
  document.getElementById("pro-panel-close")?.addEventListener("click", () => {
    const panel = document.getElementById("pro-panel");
    if (panel) panel.style.display = "none";
  });

  // Display panel toggle
  document.getElementById("display-panel-btn")?.addEventListener("click", () => {
    const panel = document.getElementById("display-panel");
    if (panel) panel.style.display = panel.style.display === "none" ? "block" : "none";
  });
  document.getElementById("display-panel-close")?.addEventListener("click", () => {
    const panel = document.getElementById("display-panel");
    if (panel) panel.style.display = "none";
  });

  // Zoom level
  const zoomLevelEl = document.getElementById("zoom-level");
  if (zoomLevelEl) zoomLevelEl.value = s.zoomLevel || "auto";

  // Theme
  function applyTheme(mode) {
    document.documentElement.setAttribute("data-theme", mode || "dark");
  }
  const themeEl = document.getElementById("app-theme");
  if (themeEl) themeEl.value = s.themeMode || "dark";
  applyTheme(s.themeMode || "dark");
  themeEl?.addEventListener("change", async () => {
    const theme = themeEl.value || "dark";
    await browser.storage.local.set({ themeMode: theme });
    applyTheme(theme);
  });

  document.getElementById("zoom-save-btn")?.addEventListener("click", async () => {
    const zoom = document.getElementById("zoom-level")?.value || "auto";
    await browser.storage.local.set({ zoomLevel: zoom });
    if (typeof btcAPI !== "undefined" && btcAPI.setZoom) btcAPI.setZoom(zoom);
    showSaveStatus("zoom-save-status", "Saved!");
  });

  // Audience Types toggle
  document.getElementById("toggle-context-presets")?.addEventListener("click", () => {
    const panel = document.getElementById("context-presets-section");
    const btn   = document.getElementById("toggle-context-presets");
    if (!panel) return;
    const open = panel.style.display === "none";
    panel.style.display = open ? "block" : "none";
    btn.textContent     = open ? "← Close" : "Manage Audience Types →";
  });

  // Manage Prompts toggle
  document.getElementById("toggle-prompts")?.addEventListener("click", () => {
    const panel = document.getElementById("prompts-panel");
    const btn   = document.getElementById("toggle-prompts");
    if (!panel) return;
    const open = panel.style.display === "none";
    panel.style.display = open ? "block" : "none";
    btn.textContent     = open ? "← Close" : "Manage Prompts →";
  });

  // Profile
  setVal("profileName",    s.profileName    || "");
  setVal("profileRole",    s.profileRole    || "");
  setVal("profileStyle",   s.profileStyle   || "");
  setVal("profileContext", s.profileContext || "");
  const profileEnabledEl = document.getElementById("profileEnabled");
  if (profileEnabledEl) profileEnabledEl.checked = s.profileEnabled || false;

  // Action editor (behind toggle)
  actionSettings = resolveActionSettings(s.actionSettings || []);
  renderActionEditor();
  document.getElementById("toggle-action-editor")?.addEventListener("click", () => {
    const panel = document.getElementById("action-editor-panel");
    const btn   = document.getElementById("toggle-action-editor");
    const open  = panel.style.display === "none";
    panel.style.display = open ? "block" : "none";
    btn.textContent     = open ? "← Close Editor" : "Edit Actions →";
  });

  document.getElementById("action-quick-select")?.addEventListener("change", (e) => {
    const id = e.target.value;
    document.querySelectorAll(".ae-row").forEach(r => r.style.outline = "");
    if (!id) return;
    const row = document.querySelector(`[data-action-id="${id}"]`);
    if (row) {
      row.style.outline = "1px solid #89b4fa";
      row.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  });

  // Context URL toggle
  document.getElementById("load-context-url-btn")?.addEventListener("click", () => {
    const row = document.getElementById("context-url-row");
    if (row) row.style.display = row.style.display === "none" ? "block" : "none";
  });
  document.getElementById("fetch-context-btn")?.addEventListener("click", async () => {
    const url     = document.getElementById("contextUrl")?.value?.trim();
    const statusEl = document.getElementById("context-url-status");
    if (!url) { statusEl.textContent = "Enter a URL first."; statusEl.className = "fetch-status status-error"; return; }
    const btn = document.getElementById("fetch-context-btn");
    btn.disabled = true; btn.textContent = "Fetching…";
    statusEl.textContent = ""; statusEl.className = "fetch-status";
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      document.getElementById("profileContext").value = text;
      statusEl.textContent = `Loaded ${text.length} characters. Click Save Settings to apply.`;
      statusEl.className   = "fetch-status status-ok";
    } catch (err) {
      statusEl.textContent = `Failed: ${err.message}`;
      statusEl.className   = "fetch-status status-error";
    } finally {
      btn.disabled = false; btn.textContent = "Fetch & Save";
    }
  });

  // Context enabled toggle
  const contextEnabledEl = document.getElementById("contextEnabled");
  if (contextEnabledEl) {
    contextEnabledEl.checked = s.contextEnabled !== false;
    contextEnabledEl.addEventListener("change", saveContext);
  }

  // Expertise level
  (function () {
    const active = s.audienceLevel || "intermediate";
    function applyExpertise(level) {
      document.querySelectorAll(".expertise-btn").forEach(btn => {
        const on = btn.dataset.level === level;
        btn.style.background = on ? "var(--accent)"    : "var(--bg-card)";
        btn.style.color      = on ? "var(--bg-card)"   : "var(--text-dim)";
        btn.style.fontWeight = on ? "700" : "400";
      });
    }
    applyExpertise(active);
    document.querySelectorAll(".expertise-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        applyExpertise(btn.dataset.level);
        await browser.storage.local.set({ audienceLevel: btn.dataset.level });
      });
    });
  })();

  // Per-audience level picker
  setCpLevel("intermediate");
  document.querySelectorAll(".cp-level-btn").forEach(btn => {
    btn.addEventListener("click", () => setCpLevel(btn.dataset.level));
  });

  // Context presets
  contextPresets = s.contextPresets || [];
  renderContextPresets();
  document.getElementById("add-context-preset-btn")?.addEventListener("click", addContextPreset);

  document.getElementById("context-preset-quick-select")?.addEventListener("change", (e) => {
    const idx     = e.target.value;
    const saveBtn = document.getElementById("add-context-preset-btn");
    const delBtn  = document.getElementById("delete-context-preset-btn");
    const nameEl  = document.getElementById("new-cpreset-name");
    const textEl  = document.getElementById("new-cpreset-text");
    if (idx === "") {
      if (nameEl) nameEl.value = "";
      if (textEl) textEl.value = "";
      setCpLevel("intermediate");
      if (saveBtn) delete saveBtn.dataset.editIdx;
      if (delBtn) delBtn.style.display = "none";
      return;
    }
    const preset = contextPresets[parseInt(idx)];
    if (!preset) return;
    if (nameEl) nameEl.value = preset.name;
    if (textEl) textEl.value = preset.text;
    setCpLevel(preset.level || "intermediate");
    if (saveBtn) saveBtn.dataset.editIdx = idx;
    if (delBtn) delBtn.style.display = "";
  });
  document.getElementById("delete-context-preset-btn")?.addEventListener("click", async () => {
    const saveBtn  = document.getElementById("add-context-preset-btn");
    const delBtn   = document.getElementById("delete-context-preset-btn");
    const quickSel = document.getElementById("context-preset-quick-select");
    const idx = parseInt(saveBtn?.dataset.editIdx);
    if (isNaN(idx)) return;
    contextPresets.splice(idx, 1);
    await browser.storage.local.set({ contextPresets });
    if (saveBtn) delete saveBtn.dataset.editIdx;
    if (delBtn) delBtn.style.display = "none";
    document.getElementById("new-cpreset-name").value = "";
    document.getElementById("new-cpreset-text").value = "";
    setCpLevel("intermediate");
    if (quickSel) quickSel.value = "";
    renderContextPresets();
  });

  // Custom prompts
  customPrompts = s.customPrompts || [];
  renderCustomPrompts();
  document.getElementById("add-prompt-btn").addEventListener("click", addPrompt);

  document.getElementById("prompt-quick-select")?.addEventListener("change", (e) => {
    const val     = e.target.value;
    const addBtn  = document.getElementById("add-prompt-btn");
    const nameEl  = document.getElementById("new-prompt-name");
    const textEl  = document.getElementById("new-prompt-text");
    const delBtn  = document.getElementById("delete-prompt-btn");
    const titleEl = document.getElementById("add-prompt-title");

    const resetForm = () => {
      if (nameEl)  { nameEl.value = ""; nameEl.readOnly = false; }
      if (textEl)  { textEl.value = ""; textEl.readOnly = false; }
      const ce = document.getElementById("prompt-clarify");
      if (ce) { ce.checked = true; ce.disabled = false; }
      if (addBtn)  { delete addBtn.dataset.editId; addBtn.textContent = "Add to Menu"; addBtn.disabled = false; }
      if (delBtn)  delBtn.style.display = "none";
      if (titleEl) titleEl.textContent = "Add New Prompt";
    };

    if (!val) { resetForm(); return; }

    if (val.startsWith("builtin-")) {
      const actionId = val.replace("builtin-", "");
      const action   = DEFAULT_ACTION_SETTINGS.find(a => a.id === actionId);
      if (!action) { resetForm(); return; }
      const isLocked = LOCKED_ACTIONS.has(actionId);
      if (nameEl)  { nameEl.value = action.label; nameEl.readOnly = isLocked; }
      if (textEl)  { textEl.value = MENU_PROMPTS[actionId] || ""; textEl.readOnly = isLocked; }
      const ce = document.getElementById("prompt-clarify");
      if (ce) { ce.checked = !!action.clarify; ce.disabled = isLocked; }
      if (addBtn)  { delete addBtn.dataset.editId; addBtn.textContent = "Add to Menu"; addBtn.disabled = isLocked; }
      if (delBtn)  delBtn.style.display = "none";
      if (titleEl) titleEl.textContent = isLocked ? "Built-in Prompt (read-only)" : "Edit Prompt";
      return;
    }

    if (!val.startsWith("custom-")) { resetForm(); return; }

    const idx = parseInt(val.replace("custom-", ""));
    const p   = customPrompts[idx];
    if (!p) return;
    if (nameEl)  { nameEl.value = p.name; nameEl.readOnly = false; }
    if (textEl)  { textEl.value = p.prompt; textEl.readOnly = false; }
    const ce = document.getElementById("prompt-clarify");
    if (ce) { ce.checked = !!p.clarify; ce.disabled = false; }
    if (addBtn)  { addBtn.dataset.editId = p.id; addBtn.textContent = "Update Prompt"; addBtn.disabled = false; }
    if (delBtn)  delBtn.style.display = currentIsPro ? "inline-block" : "none";
    if (titleEl) titleEl.textContent = "Edit Prompt";
  });

  document.getElementById("delete-prompt-btn")?.addEventListener("click", async () => {
    const addBtn = document.getElementById("add-prompt-btn");
    const editId = addBtn?.dataset.editId;
    if (!editId) return;
    if (!confirm("Delete this custom prompt? This cannot be undone.")) return;
    customPrompts = customPrompts.filter(p => p.id !== editId);
    await browser.storage.local.set({ customPrompts });
    delete addBtn.dataset.editId;
    addBtn.textContent = "Add to Menu";
    document.getElementById("add-prompt-title").textContent = "Add New Prompt";
    document.getElementById("delete-prompt-btn").style.display = "none";
    document.getElementById("new-prompt-name").value = "";
    document.getElementById("new-prompt-text").value = "";
    document.getElementById("prompt-quick-select").value = "";
    renderCustomPrompts();
  });

  document.querySelectorAll(".example-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.getElementById("new-prompt-name").value = btn.dataset.name;
      document.getElementById("new-prompt-text").value = btn.dataset.prompt;
    });
  });

  loadHistoryViewer();

  document.getElementById("view-full-history-btn")?.addEventListener("click", () => {
    btcAPI.openHistory();
  });

  document.getElementById("save-btn").addEventListener("click", save);
  document.getElementById("revert-btn").addEventListener("click", () => {
    if (confirm("Discard unsaved changes and reload settings?")) location.reload();
  });

  // Per-section save buttons
  document.getElementById("profile-save-btn")?.addEventListener("click", saveProfile);
  document.getElementById("behavior-save-btn")?.addEventListener("click", saveBehavior);
  document.getElementById("actions-save-btn")?.addEventListener("click", saveActionOrder);

  initProSection();

  // Track unsaved changes — any input/change event on the page marks it dirty
  document.querySelector(".page").addEventListener("input",  () => { isDirty = true; });
  document.querySelector(".page").addEventListener("change", () => { isDirty = true; });

  // Warn before closing with unsaved changes
  window.addEventListener("beforeunload", e => {
    if (isDirty) e.returnValue = "";
  });
}

init();
