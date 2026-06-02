const STORAGE_KEYS = [
  "configuredProviders", "geminiModels",
  // legacy keys (read for migration)
  "provider", "openaiKey", "openaiModel", "openaiModels", "openaiModelsLastFetched",
  "claudeKey", "claudeModel", "claudeModels", "claudeModelsLastFetched",
  "geminiKey", "geminiModel", "geminiModels", "geminiModelsLastFetched",
  "variants", "customPrompts", "actionSettings",
  "profileName", "profileRole", "profileStyle", "profileContext", "profileEnabled",
  "licenseEmail", "licenseKey", "syncEnabled", "contextPresets", "contextEnabled", "audienceLevel", "devMode",
  "themeMode"
];

const GUMROAD_URL    = "https://northpandalabs.gumroad.com/l/thought-tidy";
const PRO_ACTION_IDS = new Set(["sound-like-me", "sound-human", "formal", "casual", "shorten", "expand"]);
const PRO_BADGE_GRADIENT = "linear-gradient(135deg, #7c3aed, #4f46e5)";

function openGumroad() {
  browser.tabs.create({ url: GUMROAD_URL });
}

// Model fetchers/testers loaded from lib/models.js
const FETCHERS = { openai: fetchOpenAIModels, claude: fetchClaudeModels, gemini: fetchGeminiModels };
const TESTERS  = { openai: testOpenAI,        claude: testClaude,        gemini: testGemini };

const PROVIDER_INFO = {
  openai: { name: "ChatGPT (OpenAI)",   sub: "GPT-4o, o1, o3…",         keyPlaceholder: "sk-…",    keyUrl: "https://platform.openai.com/api-keys" },
  claude: { name: "Claude (Anthropic)", sub: "Haiku, Sonnet, Opus…",     keyPlaceholder: "sk-ant-…",keyUrl: "https://console.anthropic.com/settings/keys" },
  gemini: { name: "Gemini (Google)",    sub: "2.0 Flash, 1.5 Pro…",      keyPlaceholder: "AIza…",   keyUrl: "https://aistudio.google.com/app/apikey" }
};

// ── In-memory provider state ───────────────────────────────────────────────────

let configuredProviders = []; // [{id, apiKey, model}]
let geminiModels        = [null, null, null];
let wizardProvider      = null;

// ── Storage migration ─────────────────────────────────────────────────────────

async function migrateStorage() {
  const check = await browser.storage.local.get("configuredProviders");
  if (check.configuredProviders !== undefined) return; // already migrated

  // Use cryptoGet so any already-encrypted legacy keys are decrypted before reading
  const s = await cryptoGet([
    "provider", "openaiKey", "openaiModel", "claudeKey", "claudeModel", "geminiKey", "geminiModel"
  ]);

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
  await cryptoSet({ configuredProviders: providers, geminiModels: gModels });
}

async function saveProviders() {
  await cryptoSet({ configuredProviders, geminiModels });
  syncWithDesktop().catch(() => {});
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
      const addBlank = i > 0; // secondary/tertiary get an "off" option
      if (addBlank) {
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
      sel.value = (wanted && working.find(m => m.id === wanted)) ? wanted : (i === 0 ? working[0].id : "");
      sel.disabled = false;
    });

    const skipped = allModels.length - working.length;
    if (statusEl) {
      statusEl.textContent = skipped > 0
        ? `${working.length}/${allModels.length} models verified`
        : `${working.length} models verified ✓`;
      statusEl.className = "fetch-status status-ok";
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
  const container   = document.getElementById("provider-cards");
  const noState     = document.getElementById("no-providers-state");
  const addBtn      = document.getElementById("add-provider-btn");
  container.innerHTML = "";

  if (!configuredProviders.length) {
    noState.style.display = "block";
    if (addBtn) addBtn.style.display = "inline-block";
    return;
  }
  noState.style.display = "none";
  if (addBtn) addBtn.style.display = configuredProviders.length < Object.keys(PROVIDER_INFO).length ? "inline-block" : "none";

  configuredProviders.forEach((p, idx) => {
    container.appendChild(buildCard(p, idx));
  });
}

function buildCard(p, idx) {
  const info = PROVIDER_INFO[p.id] || { name: p.id, sub: "", keyPlaceholder: "", keyUrl: "#" };
  const isLast = idx === configuredProviders.length - 1;

  const card = document.createElement("div");
  card.className  = "provider-card";
  card.dataset.idx = idx;

  // ── Header ──────────────────────────────────────────────────────────────────
  const pcHeader = document.createElement("div");
  pcHeader.className = "pc-header";

  const pcInfo = document.createElement("div");
  pcInfo.className = "pc-info";

  const pcPriority = document.createElement("span");
  pcPriority.className = "pc-priority";
  pcPriority.textContent = idx + 1;

  const pcNames = document.createElement("div");
  pcNames.className = "pc-names";
  const pcNameSp = document.createElement("span");
  pcNameSp.className = "pc-name";
  pcNameSp.textContent = info.name;
  pcNames.appendChild(pcNameSp);

  // Model display (read-only summary on card face)
  if (p.id === "gemini") {
    const slots = geminiModels.filter(Boolean);
    if (slots.length) {
      const labels = ["Primary", "Secondary", "Tertiary"];
      const modelList = document.createElement("div");
      modelList.className = "pc-model-list";
      slots.forEach((m, i) => {
        const slotSp = document.createElement("span");
        slotSp.className = "pc-model-slot";
        const lblSp = document.createElement("span");
        lblSp.className = "pc-slot-label";
        lblSp.textContent = labels[i];
        slotSp.appendChild(lblSp);
        slotSp.appendChild(document.createTextNode(m));
        modelList.appendChild(slotSp);
      });
      pcNames.appendChild(modelList);
    } else {
      const none = document.createElement("span");
      none.className = "pc-model-none";
      none.textContent = "No models — click Edit to set";
      pcNames.appendChild(none);
    }
  } else if (p.id === "ollama") {
    const baseUrlShort = (p.baseUrl || "localhost:11434").replace(/^https?:\/\//, "");
    const modelSp = document.createElement("span");
    modelSp.className = "pc-model";
    modelSp.textContent = (p.model || "(no model)") + " · ";
    const small = document.createElement("small");
    small.textContent = baseUrlShort;
    modelSp.appendChild(small);
    pcNames.appendChild(modelSp);
  } else {
    const modelSp = document.createElement("span");
    modelSp.className = "pc-model";
    modelSp.textContent = p.model || "(default)";
    pcNames.appendChild(modelSp);
  }

  pcInfo.append(pcPriority, pcNames);

  const pcControls = document.createElement("div");
  pcControls.className = "pc-controls";
  if (idx > 0) {
    const up = document.createElement("button");
    up.className = "pc-btn pc-up"; up.dataset.idx = idx; up.title = "Move up"; up.textContent = "↑";
    pcControls.appendChild(up);
  }
  if (!isLast) {
    const dn = document.createElement("button");
    dn.className = "pc-btn pc-down"; dn.dataset.idx = idx; dn.title = "Move down"; dn.textContent = "↓";
    pcControls.appendChild(dn);
  }
  const pcEditBtn = document.createElement("button");
  pcEditBtn.className = "pc-btn pc-edit-btn"; pcEditBtn.dataset.idx = idx; pcEditBtn.textContent = "Edit";
  pcControls.appendChild(pcEditBtn);

  pcHeader.append(pcInfo, pcControls);
  card.appendChild(pcHeader);

  // ── Edit panel ───────────────────────────────────────────────────────────────
  const editPanel = document.createElement("div");
  editPanel.className = "pc-edit-panel";
  editPanel.style.display = "none";

  // Key / URL field
  if (p.id === "ollama") {
    const field = document.createElement("div"); field.className = "field";
    const lbl = document.createElement("label"); lbl.textContent = "Ollama Base URL";
    const urlInput = document.createElement("input");
    urlInput.type = "text"; urlInput.className = "pc-ollama-url-input";
    urlInput.value = p.baseUrl || "http://localhost:11434";
    urlInput.placeholder = "http://localhost:11434"; urlInput.autocomplete = "off";
    const hint = document.createElement("p"); hint.className = "hint"; hint.style.marginTop = "4px";
    hint.textContent = "Use http://localhost:11434 for local Ollama, or enter a remote address.";
    field.append(lbl, urlInput, hint);
    editPanel.appendChild(field);
  } else {
    const field = document.createElement("div"); field.className = "field";
    const lbl = document.createElement("label"); lbl.textContent = "API Key ";
    const link = document.createElement("a");
    link.className = "api-link pc-key-link"; link.href = info.keyUrl;
    link.target = "_blank"; link.rel = "noopener"; link.textContent = "Get key ↗";
    lbl.appendChild(link);
    const keyRow = document.createElement("div"); keyRow.className = "key-row";
    const keyInput = document.createElement("input");
    keyInput.type = "password"; keyInput.className = "pc-key-input";
    keyInput.autocomplete = "off"; keyInput.placeholder = info.keyPlaceholder;
    const showBtn = document.createElement("button");
    showBtn.className = "show-btn pc-show-btn"; showBtn.textContent = "Show";
    const testBtn = document.createElement("button");
    testBtn.className = "pc-btn pc-test-btn"; testBtn.textContent = "Test & Load Models";
    keyRow.append(keyInput, showBtn, testBtn);
    const keyStatus = document.createElement("div"); keyStatus.className = "fetch-status pc-key-status";
    field.append(lbl, keyRow, keyStatus);
    editPanel.appendChild(field);
  }

  // Model edit field
  if (p.id === "gemini") {
    const priorityField = document.createElement("div");
    priorityField.className = "field"; priorityField.style.marginBottom = "6px";
    const priorityLbl = document.createElement("label"); priorityLbl.textContent = "Model Priority ";
    const modelStatus = document.createElement("span"); modelStatus.className = "fetch-status pc-model-status";
    priorityLbl.appendChild(modelStatus);
    const refreshBtn = document.createElement("button");
    refreshBtn.className = "pc-btn pc-refresh-btn"; refreshBtn.style.marginTop = "6px";
    refreshBtn.textContent = "↻ Refresh Model Lists";
    priorityField.append(priorityLbl, refreshBtn);
    editPanel.appendChild(priorityField);
    ["Primary", "Secondary", "Tertiary"].forEach((label, i) => {
      const slotField = document.createElement("div"); slotField.className = "field";
      const slotLbl = document.createElement("label"); slotLbl.textContent = label + " Model";
      if (i > 0) {
        const optHint = document.createElement("span"); optHint.className = "hint"; optHint.textContent = " (optional)";
        slotLbl.appendChild(optHint);
      }
      const selectRow = document.createElement("div"); selectRow.className = "model-select-row";
      const sel = document.createElement("select");
      sel.className = "pc-gemini-slot-select"; sel.dataset.slot = i; sel.disabled = true;
      const opt = document.createElement("option"); opt.value = "";
      opt.textContent = geminiModels[i] || "— click Refresh —";
      sel.appendChild(opt);
      selectRow.appendChild(sel);
      slotField.append(slotLbl, selectRow);
      editPanel.appendChild(slotField);
    });
  } else {
    const field = document.createElement("div"); field.className = "field";
    const lbl = document.createElement("label"); lbl.textContent = "Model ";
    const modelStatus = document.createElement("span"); modelStatus.className = "fetch-status pc-model-status";
    lbl.appendChild(modelStatus);
    const selectRow = document.createElement("div"); selectRow.className = "model-select-row";
    const sel = document.createElement("select"); sel.className = "pc-model-select"; sel.disabled = true;
    const opt = document.createElement("option"); opt.value = "";
    opt.textContent = p.model || "— click Refresh to load models —";
    sel.appendChild(opt);
    const refreshBtn = document.createElement("button");
    refreshBtn.className = "pc-btn pc-refresh-btn"; refreshBtn.textContent = "↻ Refresh";
    selectRow.append(sel, refreshBtn);
    field.append(lbl, selectRow);
    editPanel.appendChild(field);
  }

  // Edit actions row
  const editActions = document.createElement("div"); editActions.className = "pc-edit-actions";
  const removeBtn = document.createElement("button");
  removeBtn.className = "pc-btn pc-remove-btn"; removeBtn.textContent = "Remove";
  const btnGroup = document.createElement("div"); btnGroup.style.cssText = "display:flex;gap:8px";
  const cancelEditBtn = document.createElement("button");
  cancelEditBtn.className = "pc-btn pc-cancel-edit-btn"; cancelEditBtn.textContent = "Cancel";
  const saveEditBtn = document.createElement("button");
  saveEditBtn.className = "pc-btn btn-primary pc-save-edit-btn"; saveEditBtn.textContent = "Save";
  btnGroup.append(cancelEditBtn, saveEditBtn);
  editActions.append(removeBtn, btnGroup);
  editPanel.appendChild(editActions);

  card.appendChild(editPanel);

  // Key value + show/hide + test (non-Ollama only)
  if (p.id !== "ollama") {
    card.querySelector(".pc-key-input").value = p.apiKey;
    const showBtn  = card.querySelector(".pc-show-btn");
    const keyInput = card.querySelector(".pc-key-input");
    showBtn.addEventListener("click", () => {
      keyInput.type       = keyInput.type === "password" ? "text" : "password";
      showBtn.textContent = keyInput.type === "password" ? "Show" : "Hide";
    });
    card.querySelector(".pc-test-btn").addEventListener("click", async () => {
      const key      = keyInput.value.trim();
      const statusEl = card.querySelector(".pc-key-status");
      const modelSt  = card.querySelector(".pc-model-status");
      if (!key) { statusEl.textContent = "Enter an API key first."; statusEl.className = "fetch-status status-error"; return; }
      if (p.id === "gemini") {
        const sels    = [...card.querySelectorAll(".pc-gemini-slot-select")];
        const curVals = geminiModels.map(m => m || "");
        await fetchAndPopulate("gemini", key, { statusEl: modelSt, selectEls: sels, currentValues: curVals });
        statusEl.textContent = ""; statusEl.className = "fetch-status";
      } else {
        await fetchAndPopulate(p.id, key, { statusEl: modelSt, selectEls: [card.querySelector(".pc-model-select")], currentValues: [p.model || ""] });
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
      const sels = [...card.querySelectorAll(".pc-gemini-slot-select")];
      await fetchAndPopulate("gemini", key, { statusEl: card.querySelector(".pc-model-status"), refreshBtn: card.querySelector(".pc-refresh-btn"), selectEls: sels, currentValues: geminiModels.map(m => m || "") });
    } else {
      await fetchAndPopulate(p.id, key, { statusEl: card.querySelector(".pc-model-status"), refreshBtn: card.querySelector(".pc-refresh-btn"), selectEls: [card.querySelector(".pc-model-select")], currentValues: [p.model || ""] });
    }
  });

  // Priority arrows
  card.querySelector(".pc-up")?.addEventListener("click", () => moveProvider(idx, -1));
  card.querySelector(".pc-down")?.addEventListener("click", () => moveProvider(idx, 1));

  // Edit / cancel / save / remove
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
    // else: no refresh was run — keep existing geminiModels and model unchanged
  } else {
    const sel = card.querySelector(".pc-model-select");
    if (sel && !sel.disabled && sel.value) configuredProviders[idx].model = sel.value;
    // else: no refresh was run — keep existing model unchanged
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
  document.getElementById("provider-wizard").style.display = "block";
  document.getElementById("wizard-step-1").style.display   = "block";
  document.getElementById("wizard-step-2").style.display   = "none";
  document.getElementById("add-provider-btn").style.display = "none";

  // Disable provider buttons that are already configured
  document.querySelectorAll(".wizard-provider-btn").forEach(btn => {
    const alreadyAdded = configuredProviders.some(p => p.id === btn.dataset.provider);
    btn.disabled = alreadyAdded;
    const sub = btn.querySelector(".wp-sub");
    if (sub) {
      if (alreadyAdded) {
        sub.textContent = "Already configured — Edit on card";
      } else {
        const info = PROVIDER_INFO[btn.dataset.provider];
        if (info) sub.textContent = info.sub;
      }
    }
  });

  clearWizardStep2();
}

function hideWizard() {
  document.getElementById("provider-wizard").style.display  = "none";
  document.getElementById("add-provider-btn").style.display = "inline-block";
  wizardProvider = null;
}

function clearWizardStep2() {
  document.getElementById("wizard-api-key").value        = "";
  document.getElementById("wizard-key-status").textContent  = "";
  document.getElementById("wizard-model-status").textContent = "";
  const sel = document.getElementById("wizard-model-select");
  sel.innerHTML = "<option value=''>— test your key above to load models —</option>";
  sel.disabled  = true;
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

  document.getElementById("wizard-provider-title").textContent          = info.name;
  document.getElementById("wizard-api-key").placeholder                 = info.keyPlaceholder;
  document.getElementById("wizard-key-link").href                       = info.keyUrl;
  document.getElementById("wizard-api-key-row").style.display           = isOllama ? "none" : "";
  document.getElementById("wizard-gemini-extra").style.display          = providerId === "gemini" ? "block" : "none";
  const ollamaExtra = document.getElementById("wizard-ollama-extra");
  if (ollamaExtra) ollamaExtra.style.display                            = isOllama ? "block" : "none";
  document.getElementById("wizard-test-btn").textContent                = isOllama ? "Fetch Models" : "Test & Load Models";
  document.getElementById("wizard-key-status").textContent              = "";
  document.getElementById("wizard-step-1").style.display = "none";
  document.getElementById("wizard-step-2").style.display = "block";
  if (isOllama) document.getElementById("wizard-ollama-url")?.focus();
  else          document.getElementById("wizard-api-key").focus();
}

async function wizardTestAndLoad() {
  if (!wizardProvider) return;

  // Ollama: fetch models directly from /api/tags — no API key needed
  if (wizardProvider === "ollama") {
    const baseUrl  = (document.getElementById("wizard-ollama-url")?.value || "").trim() || "http://localhost:11434";
    const statusEl = document.getElementById("wizard-key-status");
    const modelSt  = document.getElementById("wizard-model-status");
    const sel      = document.getElementById("wizard-model-select");

    // Extension: request runtime permission for non-localhost URLs
    const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(baseUrl);
    if (!isLocal) {
      try {
        const origin  = baseUrl.replace(/\/$/, "") + "/*";
        const granted = await browser.permissions.request({ origins: [origin] });
        if (!granted) {
          statusEl.textContent = "Permission denied. Browser blocked access to " + baseUrl;
          statusEl.className   = "fetch-status status-error";
          return;
        }
      } catch (_) { /* permissions API not available, proceed anyway */ }
    }

    modelSt.textContent = "Fetching models…"; modelSt.className = "fetch-status status-loading";
    statusEl.textContent = ""; statusEl.className = "fetch-status";
    try {
      const models = await fetchOllamaModels(baseUrl);
      sel.innerHTML = "";
      models.forEach(m => {
        const opt = document.createElement("option");
        opt.value = m.id; opt.textContent = m.label;
        sel.appendChild(opt);
      });
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
  if (!apiKey) {
    statusEl.textContent = "Enter an API key first.";
    statusEl.className   = "fetch-status status-error";
    return;
  }

  const sel1 = document.getElementById("wizard-model-select");
  const sel2 = document.getElementById("wizard-gemini-model-2");
  const sel3 = document.getElementById("wizard-gemini-model-3");
  const sels = wizardProvider === "gemini" ? [sel1, sel2, sel3] : [sel1];

  const working = await fetchAndPopulate(wizardProvider, apiKey, {
    statusEl:     document.getElementById("wizard-model-status"),
    selectEls:    sels,
    currentValues:[]
  });

  if (working) {
    statusEl.textContent = "Key valid ✓";
    statusEl.className   = "fetch-status status-ok";
  } else {
    statusEl.textContent = "Key validation failed. Check key and retry.";
    statusEl.className   = "fetch-status status-error";
  }
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
    const baseUrl = (document.getElementById("wizard-ollama-url")?.value || "").trim() || "http://localhost:11434";
    const model   = document.getElementById("wizard-model-select").value || "";
    configuredProviders.push({ id: "ollama", apiKey: "", model, baseUrl });
    await saveProviders();
    hideWizard();
    renderProviderCards();
    return;
  }

  const apiKey = document.getElementById("wizard-api-key").value.trim();
  if (!apiKey) {
    statusEl.textContent = "Enter an API key first.";
    statusEl.className   = "fetch-status status-error";
    return;
  }

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
      divider.innerHTML = `— <span style="font-size:10px;font-weight:700;color:#fff;background:${PRO_BADGE_GRADIENT};padding:1px 6px;border-radius:100px;vertical-align:middle">PRO</span> actions below — upgrade to reorder —`;
      list.appendChild(divider);
    }

    const row = document.createElement("div");
    row.className = `ae-row${!action.enabled ? " ae-disabled" : ""}`;
    row.dataset.actionId = action.id;

    const ordDiv = document.createElement("div"); ordDiv.className = "ae-order";
    const upOrd = document.createElement("button");
    upOrd.className = "ae-ord-btn ae-up"; upOrd.textContent = "▲";
    const dnOrd = document.createElement("button");
    dnOrd.className = "ae-ord-btn ae-dn"; dnOrd.textContent = "▼";

    if (!currentIsPro && isProAction) {
      upOrd.disabled = true;
      upOrd.title = "Pro feature — upgrade to reorder Pro actions";
      dnOrd.disabled = true;
      dnOrd.title = "Pro feature — upgrade to reorder Pro actions";
    } else if (!currentIsPro) {
      // Free user moving free actions — only within freeActs group
      const freeIdx = freeActs.indexOf(action);
      upOrd.disabled = freeIdx === 0;
      upOrd.title = "Move up";
      dnOrd.disabled = freeIdx === freeActs.length - 1;
      dnOrd.title = "Move down";
    } else {
      // Pro user — full control by realIdx
      upOrd.disabled = realIdx === 0;
      upOrd.title = "Move up";
      dnOrd.disabled = realIdx === actionSettings.length - 1;
      dnOrd.title = "Move down";
    }
    ordDiv.append(upOrd, dnOrd);

    const check = document.createElement("input");
    check.type = "checkbox"; check.className = "ae-check"; check.checked = !!action.enabled;
    if (isOnlyOne) { check.disabled = true; check.title = "At least one action must stay enabled"; }
    else if (!currentIsPro) { check.disabled = true; check.title = "Pro feature — upgrade to enable/disable actions"; }

    const badge = document.createElement("span"); badge.className = "ae-lock-badge";
    if (isLocked) {
      const lbl = document.createElement("span"); lbl.className = "ae-label"; lbl.textContent = action.label;
      badge.textContent = "built-in";
      row.append(ordDiv, check, lbl, badge);
    } else {
      const inp = document.createElement("input");
      inp.className = "ae-name-input"; inp.value = action.label; inp.placeholder = "Action name";
      if (!currentIsPro) { inp.readOnly = true; inp.title = "Pro feature — upgrade to rename actions"; }
      row.append(ordDiv, check, inp, badge);
    }

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

// ── Custom Prompts ─────────────────────────────────────────────────────────────

let customPrompts   = [];
let contextPresets  = [];

const DEFAULT_AUDIENCE_PRESETS = [
  { name: "Casual Reader",    text: "Write for a casual reader. Use friendly, everyday language — simple, clear, and conversational. Avoid jargon." },
  { name: "Professional",     text: "Write for a professional audience. Use polished, industry-standard language and an authoritative tone." },
  { name: "Technical Expert", text: "Write for a technical expert. Be precise and concise — skip basic explanations and use specialized terminology freely." },
];

function renderContextPresets() {
  const list = document.getElementById("context-presets-list");
  if (!list) return;
  list.innerHTML = "";

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
    btn.style.background = on ? "#89b4fa" : "#1e1e2e";
    btn.style.color      = on ? "#1e1e2e" : "#9399b2";
    btn.style.fontWeight = on ? "700" : "400";
  });
}
function getCpLevel() {
  return document.querySelector(".cp-level-btn[style*='#89b4fa']")?.dataset.level || "intermediate";
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
  await cryptoSet({ contextPresets });
  document.getElementById("new-cpreset-name").value = "";
  document.getElementById("new-cpreset-text").value = "";
  setCpLevel("intermediate");
  const quickSel = document.getElementById("context-preset-quick-select");
  if (quickSel) quickSel.value = "";
  const delBtn = document.getElementById("delete-context-preset-btn");
  if (delBtn) delBtn.style.display = "none";
  renderContextPresets();
}

function renderCustomPrompts() {
  const promptSel = document.getElementById("prompt-quick-select");
  if (promptSel) {
    const curVal = promptSel.value;
    promptSel.innerHTML = '<option value="">— Add new action —</option>';
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
      let freeBasicSeen = 0, freeClarifySeen = 0;
      customPrompts.forEach((p, i) => {
        const opt = document.createElement("option");
        opt.value = "custom-" + i;
        if (!currentIsPro) {
          const overLimit = p.clarify ? (freeClarifySeen++ >= 1) : (freeBasicSeen++ >= 1);
          opt.textContent = overLimit ? p.name + " (over limit)" : p.name;
          opt.disabled    = overLimit;
        } else {
          opt.textContent = p.name;
        }
        promptSel.appendChild(opt);
      });
    }
    const restorable = promptSel.querySelector(`option[value="${curVal}"]:not([disabled])`);
    promptSel.value = restorable ? curVal : "";
  }

  const list = document.getElementById("custom-prompts-list");
  list.textContent = "";

  if (!customPrompts.length) {
    const hint = document.createElement("p");
    hint.className = "no-prompts hint";
    hint.textContent = "No custom actions yet — add one below.";
    list.appendChild(hint);
    return;
  }

  customPrompts.forEach((p, i) => {
    const nameSpan = document.createElement("span");
    nameSpan.className = "cp-name";
    nameSpan.textContent = p.name;
    if (p.clarify) {
      const badge = document.createElement("span");
      badge.className = "cp-clarify-badge"; badge.textContent = "clarify";
      nameSpan.appendChild(badge);
    }
    const orderSpan = document.createElement("span");
    orderSpan.className = "cp-order";
    orderSpan.textContent = `#${i + 1} in menu`;
    const meta = document.createElement("div");
    meta.className = "cp-meta";
    meta.append(nameSpan, orderSpan);

    const textDiv = document.createElement("div");
    textDiv.className = "cp-text";
    textDiv.textContent = p.prompt.length > 100 ? p.prompt.slice(0, 100) + "…" : p.prompt;

    const mkBtn = (cls, label) => {
      const btn = document.createElement("button");
      btn.className = `cp-btn ${cls}`;
      btn.dataset.id = p.id;
      btn.textContent = label;
      return btn;
    };
    const actionsDiv = document.createElement("div");
    actionsDiv.className = "cp-actions";
    actionsDiv.append(mkBtn("cp-edit", "Edit"), mkBtn("cp-delete", "Delete"));
    if (i > 0)                        actionsDiv.appendChild(mkBtn("cp-up",   "↑"));
    if (i < customPrompts.length - 1) actionsDiv.appendChild(mkBtn("cp-down", "↓"));

    const item = document.createElement("div");
    item.className = "cp-item";
    item.dataset.id = p.id;
    item.append(meta, textDiv, actionsDiv);
    list.appendChild(item);
  });

  list.querySelectorAll(".cp-delete").forEach(btn => btn.addEventListener("click", async () => {
    customPrompts = customPrompts.filter(p => p.id !== btn.dataset.id);
    await cryptoSet({ customPrompts });
    renderCustomPrompts();
  }));
  list.querySelectorAll(".cp-edit").forEach(btn => btn.addEventListener("click", () => {
    const p = customPrompts.find(x => x.id === btn.dataset.id);
    if (!p) return;
    document.getElementById("new-prompt-name").value = p.name;
    document.getElementById("new-prompt-text").value = p.prompt;
    customPrompts = customPrompts.filter(x => x.id !== p.id);
    renderCustomPrompts();
    document.getElementById("add-prompt-form").scrollIntoView({ behavior: "smooth" });
  }));
  list.querySelectorAll(".cp-up").forEach(btn => btn.addEventListener("click", async () => {
    const idx = customPrompts.findIndex(p => p.id === btn.dataset.id);
    if (idx > 0) { [customPrompts[idx - 1], customPrompts[idx]] = [customPrompts[idx], customPrompts[idx - 1]]; await cryptoSet({ customPrompts }); renderCustomPrompts(); }
  }));
  list.querySelectorAll(".cp-down").forEach(btn => btn.addEventListener("click", async () => {
    const idx = customPrompts.findIndex(p => p.id === btn.dataset.id);
    if (idx < customPrompts.length - 1) { [customPrompts[idx], customPrompts[idx + 1]] = [customPrompts[idx + 1], customPrompts[idx]]; await cryptoSet({ customPrompts }); renderCustomPrompts(); }
  }));

  const addForm = document.getElementById("add-prompt-form");
  if (addForm) {
    const hasBasic   = customPrompts.some(p => !p.clarify);
    const hasClarify = customPrompts.some(p =>  p.clarify);
    const freeIsFull = hasBasic && hasClarify;
    const isFull     = currentIsPro ? customPrompts.length >= 8 : freeIsFull;
    addForm.style.display = isFull ? "none" : "";

    // For free users, guide the clarify checkbox toward whichever slot is still open
    const clarifyEl = document.getElementById("prompt-clarify");
    if (!currentIsPro && clarifyEl && !isFull) {
      if (!hasBasic && !hasClarify) {
        clarifyEl.disabled = false; // Let them choose for their first slot
      } else if (!hasBasic) {
        clarifyEl.checked = false; clarifyEl.disabled = true; // Must add a basic prompt
      } else {
        clarifyEl.checked = true; clarifyEl.disabled = true; // Must add a clarify prompt
      }
    } else if (clarifyEl) {
      clarifyEl.disabled = false;
    }

    const warn = document.getElementById("free-prompt-warning");
    if (warn) warn.style.display = !currentIsPro ? "block" : "none";
  }
}

function addPrompt() {
  const name      = document.getElementById("new-prompt-name")?.value.trim() ?? "";
  const prompt    = document.getElementById("new-prompt-text")?.value.trim() ?? "";
  const isClarify = document.getElementById("prompt-clarify")?.checked || false;
  if (!name || !prompt) { alert("Enter both a name and an instruction."); return; }

  const addBtn = document.getElementById("add-prompt-btn");
  const editId = addBtn?.dataset.editId;

  if (editId) {
    const idx = customPrompts.findIndex(p => p.id === editId);
    if (idx !== -1) customPrompts[idx] = { ...customPrompts[idx], name, prompt, clarify: isClarify };
    delete addBtn.dataset.editId;
    addBtn.textContent = "Add to Menu";
    const titleEl = document.getElementById("add-prompt-title");
    if (titleEl) titleEl.textContent = "Add New Action";
    const delBtn = document.getElementById("delete-prompt-btn");
    if (delBtn)  delBtn.style.display = "none";
    const promptSel = document.getElementById("prompt-quick-select");
    if (promptSel) promptSel.value = "";
  } else {
    if (!currentIsPro) {
      const hasBasic   = customPrompts.some(p => !p.clarify);
      const hasClarify = customPrompts.some(p => p.clarify);
      if (isClarify && hasClarify)  { alert("Free tier: you already have a clarify action. Upgrade to Pro to add more."); return; }
      if (!isClarify && hasBasic)   { alert("Free tier: you already have a basic action. Upgrade to Pro to add more."); return; }
    } else if (customPrompts.length >= 8) {
      alert("Maximum 8 custom actions.");
      return;
    }
    customPrompts.push({ id: uid(), name, prompt, clarify: isClarify });
  }
  renderCustomPrompts();
  document.getElementById("new-prompt-name").value = "";
  document.getElementById("new-prompt-text").value = "";
  const clarifyEl = document.getElementById("prompt-clarify");
  if (clarifyEl) clarifyEl.checked = true;
}

// ── History viewer ─────────────────────────────────────────────────────────────

async function loadHistoryViewer() {
  const stored = await browser.storage.local.get(["historyLog", "licenseEmail", "licenseKey"]);
  const historyLog = stored.historyLog || [];
  const isPro = isProUnlocked(stored);
  const entries = isPro ? [...historyLog] : purgeOldLog(historyLog);
  const section = document.getElementById("history-viewer-section");
  if (!section) return;

  if (!entries.length) { section.style.display = "none"; return; }
  document.getElementById("history-viewer-count").textContent = entries.length;

  const list = document.getElementById("history-viewer-list");
  list.innerHTML = "";
  [...entries].reverse().forEach(e => {
    const t    = new Date(e.timestamp);
    const time = `${String(t.getHours()).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")}`;
    const row  = document.createElement("div");
    row.className = "hv-entry";
    [
      ["hv-time",   time],
      ["hv-action", e.action.replace(/-/g, " ")],
      ["hv-meta",   [e.provider, e.model].filter(Boolean).join(" · ")],
      ["hv-words",  `${e.inputLen || 0} → ${e.outputLen || 0} chars`],
    ].forEach(([cls, txt]) => {
      const sp = document.createElement("span"); sp.className = cls; sp.textContent = txt;
      row.appendChild(sp);
    });
    list.appendChild(row);
  });

  document.getElementById("history-clear-btn")?.addEventListener("click", async () => {
    if (!confirm("Clear all of today's history?")) return;
    const { historyLog: hl = [] } = await browser.storage.local.get("historyLog");
    const today = todayDate();
    await browser.storage.local.set({ historyLog: hl.filter(e => e.date !== today) });
    section.style.display = "none";
  }, { once: true });
}

// ── Save ───────────────────────────────────────────────────────────────────────

async function save() {
  // Check if the user's last-used action was disabled — reset if needed
  const { lastAction = "" } = await browser.storage.local.get("lastAction");
  const enabledIds    = new Set(actionSettings.filter(a => a.enabled).map(a => a.id));
  let resetMsg        = "";
  let resolvedAction  = lastAction;
  if (lastAction && !lastAction.startsWith("custom-") && !enabledIds.has(lastAction)) {
    const first    = actionSettings.find(a => a.enabled);
    resolvedAction = first?.id || "";
    resetMsg       = ` Note: your last action was disabled. Switched to "${first?.label || resolvedAction}".`;
    await browser.storage.local.set({ lastAction: resolvedAction });
  }

  const syncEnabled = document.getElementById("syncEnabled")?.checked !== false;
  await cryptoSet({
    customPrompts,
    actionSettings,
    profileName:    getVal("profileName"),
    profileRole:    getVal("profileRole"),
    profileStyle:   getVal("profileStyle"),
    profileContext: getVal("profileContext"),
    profileEnabled: document.getElementById("profileEnabled")?.checked || false
  });
  await browser.storage.local.set({ syncEnabled });
  if (syncEnabled) syncWithDesktop().catch(() => {});
  const status = document.getElementById("save-status");
  status.textContent = "Saved!" + resetMsg;
  status.className   = "status-ok";
  setTimeout(() => { status.textContent = ""; }, resetMsg ? 5000 : 2000);
}

// ── Init ───────────────────────────────────────────────────────────────────────

async function init() {
  await migrateStorage();

  const s = await cryptoGet(STORAGE_KEYS);

  document.documentElement.setAttribute("data-theme", s.themeMode || "dark");

  configuredProviders = s.configuredProviders || [];
  geminiModels        = s.geminiModels || [null, null, null];

  // Ollama is desktop-only — remove any legacy extension-side Ollama entries
  const preLen = configuredProviders.length;
  configuredProviders = configuredProviders.filter(p => p.id !== "ollama");
  if (configuredProviders.length !== preLen) saveProviders();

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

  // Wizard show/hide key
  const wzKey = document.getElementById("wizard-api-key");
  const wzShow = document.getElementById("wizard-show-btn");
  wzShow.addEventListener("click", () => {
    wzKey.type        = wzKey.type === "password" ? "text" : "password";
    wzShow.textContent = wzKey.type === "password" ? "Show" : "Hide";
  });

  // Profile fields
  setVal("profileName",    s.profileName    || "");
  setVal("profileRole",    s.profileRole    || "");
  setVal("profileStyle",   s.profileStyle   || "");
  setVal("profileContext", s.profileContext || "");
  const profileEnabledEl = document.getElementById("profileEnabled");
  if (profileEnabledEl) profileEnabledEl.checked = s.profileEnabled || false;

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

  document.getElementById("prompt-quick-select")?.addEventListener("change", (e) => {
    const val     = e.target.value;
    const nameEl  = document.getElementById("new-prompt-name");
    const textEl  = document.getElementById("new-prompt-text");
    const addBtn  = document.getElementById("add-prompt-btn");
    const titleEl = document.getElementById("add-prompt-title");
    const delBtn  = document.getElementById("delete-prompt-btn");

    const resetForm = () => {
      if (nameEl)  { nameEl.value = ""; nameEl.readOnly = false; }
      if (textEl)  { textEl.value = ""; textEl.readOnly = false; }
      const ce = document.getElementById("prompt-clarify");
      if (ce) { ce.checked = true; ce.disabled = false; }
      if (addBtn)  { delete addBtn.dataset.editId; addBtn.textContent = "Add to Menu"; addBtn.disabled = false; }
      if (titleEl) titleEl.textContent = "Add New Action";
      if (delBtn)  delBtn.style.display = "none";
    };

    if (!val) {
      resetForm();
      const addForm = document.getElementById("add-prompt-form");
      if (addForm && !currentIsPro) {
        const freeIsFull = customPrompts.some(p => !p.clarify) && customPrompts.some(p => p.clarify);
        if (freeIsFull) addForm.style.display = "none";
      }
      return;
    }

    if (val.startsWith("builtin-")) {
      const actionId = val.replace("builtin-", "");
      const action   = DEFAULT_ACTION_SETTINGS.find(a => a.id === actionId);
      if (!action) { resetForm(); return; }
      const isLocked = LOCKED_ACTIONS.has(actionId);
      const ro = !currentIsPro || isLocked;
      if (nameEl)  { nameEl.value = action.label; nameEl.readOnly = ro; }
      if (textEl)  { textEl.value = MENU_PROMPTS[actionId] || ""; textEl.readOnly = ro; }
      const ce = document.getElementById("prompt-clarify");
      if (ce) { ce.checked = !!action.clarify; ce.disabled = ro; }
      if (addBtn)  { delete addBtn.dataset.editId; addBtn.textContent = "Add to Menu"; addBtn.disabled = ro; }
      if (delBtn)  delBtn.style.display = "none";
      if (titleEl) titleEl.textContent = ro ? "Built-in Action (read-only)" : "Edit Action";
      return;
    }

    const idx = parseInt(val.replace("custom-", ""), 10);
    const p   = customPrompts[idx];
    if (!p) return;
    if (nameEl)  { nameEl.value = p.name; nameEl.readOnly = false; }
    if (textEl)  { textEl.value = p.prompt; textEl.readOnly = false; }
    const clarifyEl = document.getElementById("prompt-clarify");
    if (clarifyEl) { clarifyEl.checked = !!p.clarify; clarifyEl.disabled = false; }
    if (addBtn)  { addBtn.dataset.editId = p.id; addBtn.textContent = "Save Changes"; addBtn.disabled = false; }
    if (titleEl) titleEl.textContent = "Edit Action";
    if (delBtn)  delBtn.style.display = "";
    document.getElementById("add-prompt-form")?.style.setProperty("display", "");
  });

  document.getElementById("delete-prompt-btn")?.addEventListener("click", async () => {
    const addBtn = document.getElementById("add-prompt-btn");
    const editId = addBtn?.dataset.editId;
    if (!editId) return;
    if (!confirm("Delete this action? This cannot be undone.")) return;
    customPrompts = customPrompts.filter(p => p.id !== editId);
    await cryptoSet({ customPrompts });
    delete addBtn.dataset.editId;
    addBtn.textContent = "Add to Menu";
    const titleEl = document.getElementById("add-prompt-title");
    if (titleEl) titleEl.textContent = "Add New Action";
    const delBtn = document.getElementById("delete-prompt-btn");
    if (delBtn)  delBtn.style.display = "none";
    const promptSel = document.getElementById("prompt-quick-select");
    if (promptSel) promptSel.value = "";
    document.getElementById("new-prompt-name").value = "";
    document.getElementById("new-prompt-text").value = "";
    renderCustomPrompts();
  });

  // Context enabled toggle
  const contextEnabledEl = document.getElementById("contextEnabled");
  if (contextEnabledEl) contextEnabledEl.checked = s.contextEnabled !== false;
  document.getElementById("context-save-btn")?.addEventListener("click", async () => {
    const contextEnabled = document.getElementById("contextEnabled")?.checked !== false;
    await browser.storage.local.set({ contextEnabled });
    const st = document.getElementById("context-save-status");
    if (st) { st.textContent = "Saved!"; setTimeout(() => { st.textContent = ""; }, 2000); }
  });

  // Expertise level
  (function () {
    const LEVELS = ["beginner", "intermediate", "advanced", "expert"];
    const active = s.audienceLevel || "intermediate";
    function applyExpertise(level) {
      document.querySelectorAll(".expertise-btn").forEach(btn => {
        const on = btn.dataset.level === level;
        btn.style.background   = on ? "#89b4fa" : "#1e1e2e";
        btn.style.color        = on ? "#1e1e2e" : "#9399b2";
        btn.style.fontWeight   = on ? "700" : "400";
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

  // Per-audience level picker buttons
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
    await cryptoSet({ contextPresets });
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
  document.querySelectorAll(".example-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.getElementById("new-prompt-name").value = btn.dataset.name;
      document.getElementById("new-prompt-text").value = btn.dataset.prompt;
    });
  });

  loadHistoryViewer();

  document.getElementById("view-full-history-btn")?.addEventListener("click", () => {
    browser.tabs.create({ url: browser.runtime.getURL("history/history.html") });
  });

  document.getElementById("save-btn").addEventListener("click", save);
  document.getElementById("revert-btn").addEventListener("click", () => {
    if (confirm("Discard unsaved changes and reload settings?")) location.reload();
  });

  // Per-section save buttons
  document.getElementById("profile-save-btn")?.addEventListener("click", saveProfile);
  document.getElementById("actions-save-btn")?.addEventListener("click", saveActions);
  document.getElementById("sync-save-btn")?.addEventListener("click", saveSyncSetting);

  // Theme toggle init
  const themeToggle = document.getElementById("themeToggle");
  if (themeToggle) themeToggle.checked = (s.themeMode === "light");
  document.getElementById("theme-save-btn")?.addEventListener("click", saveThemeSetting);

  document.getElementById("activate-pro-link-btn")?.addEventListener("click", () => {
    const panel = document.getElementById("pro-panel");
    if (panel) panel.style.display = panel.style.display === "none" ? "block" : "none";
  });
  document.getElementById("pro-panel-close")?.addEventListener("click", () => {
    const panel = document.getElementById("pro-panel");
    if (panel) panel.style.display = "none";
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
    btn.textContent     = open ? "← Close" : "Manage Actions →";
  });

  // Desktop sync toggle
  const syncEnabled = await browser.storage.local.get("syncEnabled");
  const syncEl = document.getElementById("syncEnabled");
  if (syncEl) syncEl.checked = syncEnabled.syncEnabled !== false;

  // TEST ONLY banner
  if (typeof BUILD_FLAGS !== "undefined" && BUILD_FLAGS.testBuild) {
    const banner = document.getElementById("test-only-banner");
    if (banner) banner.style.display = "block";
  }

  // Update notice
  const { updateAvailable } = await browser.storage.local.get("updateAvailable");
  if (updateAvailable?.version) {
    const notice = document.getElementById("update-notice");
    const link   = document.getElementById("update-link");
    if (notice && link) {
      link.textContent = `Version ${updateAvailable.version} available. Download from GitHub ↗`;
      link.href        = updateAvailable.url;
      notice.style.display = "block";
    }
  }

  initProSection();
}

function getVal(id) { return document.getElementById(id)?.value ?? ""; }
function setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v; }

// ── Per-section saves ──────────────────────────────────────────────────────────

function showSectionStatus(elId, msg, isErr) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.className   = "section-save-status " + (isErr ? "err" : "ok");
  setTimeout(() => { el.textContent = ""; el.className = "section-save-status"; }, 2500);
}

async function saveBehavior() {
  showSectionStatus("behavior-save-status", "Saved!");
}

async function saveProfile() {
  await cryptoSet({
    profileName:    getVal("profileName"),
    profileRole:    getVal("profileRole"),
    profileStyle:   getVal("profileStyle"),
    profileContext: getVal("profileContext"),
    profileEnabled: document.getElementById("profileEnabled")?.checked || false
  });
  syncWithDesktop().catch(() => {});
  showSectionStatus("profile-save-status", "Saved!");
}

async function saveActions() {
  const { lastAction = "" } = await browser.storage.local.get("lastAction");
  const enabledIds = new Set(actionSettings.filter(a => a.enabled).map(a => a.id));
  if (lastAction && !lastAction.startsWith("custom-") && !enabledIds.has(lastAction)) {
    const first = actionSettings.find(a => a.enabled);
    await browser.storage.local.set({ lastAction: first?.id || "" });
  }
  await cryptoSet({ actionSettings });
  showSectionStatus("actions-save-status", "Saved!");
}

async function saveSyncSetting() {
  const enabled = document.getElementById("syncEnabled")?.checked || false;
  await browser.storage.local.set({ syncEnabled: enabled });
  if (enabled) syncWithDesktop().catch(() => {});
  showSectionStatus("sync-save-status", "Saved!");
}

async function saveThemeSetting() {
  const mode = document.getElementById("themeToggle")?.checked ? "light" : "dark";
  await browser.storage.local.set({ themeMode: mode });
  document.documentElement.setAttribute("data-theme", mode);
  showSectionStatus("theme-save-status", "Saved!");
}

// ── Pro gate ───────────────────────────────────────────────────────────────────

function applyProGates(isPro) {
  currentIsPro = isPro;
  ["profile-section", "history-viewer-section", "context-presets-section"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle("locked", !isPro);
  });
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
  if (proBtn) proBtn.textContent = isPro ? "⚡ Pro Active — Manage ↓" : "⚡ Activate Pro";

  // History title and hint
  const histTitle = document.getElementById("history-title-text");
  if (histTitle) histTitle.textContent = isPro ? "All History" : "Today's History";
  const histFreeHint = document.getElementById("history-free-hint");
  if (histFreeHint) histFreeHint.style.display = isPro ? "none" : "block";
  document.getElementById("history-upgrade-link")?.addEventListener("click", openGumroad);

  // Seed 3 default audience presets the first time Pro is activated
  if (isPro && !contextPresets.length) {
    contextPresets = DEFAULT_AUDIENCE_PRESETS.map(p => ({ ...p, id: uid() }));
    browser.storage.local.set({ contextPresets });
    renderContextPresets();
  }
}

function initProSection() {
  cryptoGet(["licenseEmail", "licenseKey"]).then(s => {
    const isPro = isProUnlocked(s);
    applyProGates(isPro);
    if (isPro) {
      const emailEl = document.getElementById("pro-active-email");
      if (emailEl) emailEl.textContent = s.licenseEmail;
    }
  });

  document.getElementById("pro-buy-link")?.addEventListener("click", openGumroad);

  const proKeyInput   = document.getElementById("pro-key-input");
  const proKeyShowBtn = document.getElementById("pro-key-show-btn");
  let proKeyReal   = "";
  let proKeyMasked = true;
  const maskKey = (v) => v.replace(/[^-]/g, "•");

  proKeyShowBtn?.addEventListener("click", () => {
    proKeyMasked = !proKeyMasked;
    proKeyShowBtn.textContent = proKeyMasked ? "Show" : "Hide";
    if (proKeyInput) proKeyInput.value = proKeyMasked ? maskKey(proKeyReal) : proKeyReal;
  });

  proKeyInput?.addEventListener("input", (e) => {
    const v = e.target.value;
    if (!proKeyMasked) {
      const raw = v.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      proKeyReal = (raw.match(/.{1,8}/g)?.join("-") ?? raw).slice(0, 35);
      e.target.value = proKeyReal;
    } else {
      const oldAlpha = proKeyReal.replace(/-/g, "");
      const kept  = v.split("").filter(c => c === "•").length;
      const added = v.replace(/[•-]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const raw   = oldAlpha.slice(0, kept) + added;
      proKeyReal  = (raw.match(/.{1,8}/g)?.join("-") ?? raw).slice(0, 35);
      e.target.value = maskKey(proKeyReal);
      e.target.setSelectionRange(e.target.value.length, e.target.value.length);
    }
  });

  document.querySelectorAll(".pro-unlock-link").forEach(a => {
    a.addEventListener("click", () => {
      const panel = document.getElementById("pro-panel");
      if (panel) panel.style.display = "block";
    });
  });

  document.querySelectorAll(".pro-buy-direct").forEach(a => {
    a.addEventListener("click", openGumroad);
  });

  document.getElementById("activate-pro-btn")?.addEventListener("click", async () => {
    const email = document.getElementById("pro-email-input")?.value?.trim();
    const key   = proKeyReal;
    const msgEl = document.getElementById("pro-status-msg");
    const btn   = document.getElementById("activate-pro-btn");
    if (!email || !key) { msgEl.textContent = "Enter your email and license key."; msgEl.className = "pro-status-msg error"; return; }
    btn.disabled    = true;
    btn.textContent = "Verifying…";
    msgEl.textContent = ""; msgEl.className = "pro-status-msg";
    const result = await verifyWithGumroad(email, key);
    btn.disabled    = false;
    btn.textContent = "Activate";
    if (!result.valid) { msgEl.textContent = result.error; msgEl.className = "pro-status-msg error"; return; }
    await cryptoSet({ licenseEmail: email, licenseKey: key });
    syncWithDesktop().catch(() => {});
    const emailEl = document.getElementById("pro-active-email");
    if (emailEl) emailEl.textContent = email;
    applyProGates(true);
    const panel = document.getElementById("pro-panel");
    if (panel) panel.style.display = "none";
  });

  document.getElementById("deactivate-pro-btn")?.addEventListener("click", async () => {
    await browser.storage.local.remove(["licenseEmail", "licenseKey"]);
    document.getElementById("pro-email-input").value = "";
    proKeyReal = "";
    if (proKeyInput) proKeyInput.value = "";
    applyProGates(false);
    const panel = document.getElementById("pro-panel");
    if (panel) panel.style.display = "none";
  });
}

const _yr = new Date().getFullYear();
document.getElementById("copyright-year").textContent = _yr > 2026 ? `2026–${_yr}` : "2026";

init();
