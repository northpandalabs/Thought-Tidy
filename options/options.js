const STORAGE_KEYS = [
  "configuredProviders", "geminiModels",
  // legacy keys (read for migration)
  "provider", "openaiKey", "openaiModel", "openaiModels", "openaiModelsLastFetched",
  "claudeKey", "claudeModel", "claudeModels", "claudeModelsLastFetched",
  "geminiKey", "geminiModel", "geminiModels", "geminiModelsLastFetched",
  "variants", "customPrompts", "actionSettings",
  "profileName", "profileRole", "profileStyle", "profileContext", "profileEnabled",
  "licenseEmail", "licenseKey"
];

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
  document.getElementById("wizard-ollama-extra").style.display          = isOllama ? "block" : "none";
  document.getElementById("wizard-test-btn").textContent                = isOllama ? "Fetch Models" : "Test & Load Models";
  document.getElementById("wizard-key-status").textContent              = "";
  document.getElementById("wizard-step-1").style.display = "none";
  document.getElementById("wizard-step-2").style.display = "block";
  if (isOllama) document.getElementById("wizard-ollama-url").focus();
  else          document.getElementById("wizard-api-key").focus();
}

async function wizardTestAndLoad() {
  if (!wizardProvider) return;

  // Ollama: fetch models directly from /api/tags — no API key needed
  if (wizardProvider === "ollama") {
    const baseUrl  = document.getElementById("wizard-ollama-url").value.trim() || "http://localhost:11434";
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
    const baseUrl = document.getElementById("wizard-ollama-url").value.trim() || "http://localhost:11434";
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

function renderActionEditor() {
  const list = document.getElementById("action-list");
  if (!list) return;
  list.innerHTML = "";
  const enabledCount = actionSettings.filter(a => a.enabled).length;

  actionSettings.forEach((action, idx) => {
    const isLocked    = LOCKED_ACTIONS.has(action.id);
    const isOnlyOne   = action.enabled && enabledCount === 1;
    const row = document.createElement("div");
    row.className = `ae-row${!action.enabled ? " ae-disabled" : ""}`;

    const ordDiv = document.createElement("div"); ordDiv.className = "ae-order";
    const upOrd = document.createElement("button");
    upOrd.className = "ae-ord-btn ae-up"; upOrd.title = "Move up"; upOrd.textContent = "▲";
    if (idx === 0) upOrd.disabled = true;
    const dnOrd = document.createElement("button");
    dnOrd.className = "ae-ord-btn ae-dn"; dnOrd.title = "Move down"; dnOrd.textContent = "▼";
    if (idx === actionSettings.length - 1) dnOrd.disabled = true;
    ordDiv.append(upOrd, dnOrd);

    const check = document.createElement("input");
    check.type = "checkbox"; check.className = "ae-check"; check.checked = !!action.enabled;
    if (isOnlyOne) { check.disabled = true; check.title = "At least one action must stay enabled"; }

    const badge = document.createElement("span"); badge.className = "ae-lock-badge";
    if (isLocked) {
      const lbl = document.createElement("span"); lbl.className = "ae-label"; lbl.textContent = action.label;
      badge.textContent = "built-in";
      row.append(ordDiv, check, lbl, badge);
    } else {
      const inp = document.createElement("input");
      inp.className = "ae-name-input"; inp.value = action.label; inp.placeholder = "Action name";
      row.append(ordDiv, check, inp, badge);
    }

    row.querySelector(".ae-up").addEventListener("click", () => {
      if (idx > 0) { [actionSettings[idx - 1], actionSettings[idx]] = [actionSettings[idx], actionSettings[idx - 1]]; renderActionEditor(); }
    });
    row.querySelector(".ae-dn").addEventListener("click", () => {
      if (idx < actionSettings.length - 1) { [actionSettings[idx], actionSettings[idx + 1]] = [actionSettings[idx + 1], actionSettings[idx]]; renderActionEditor(); }
    });
    row.querySelector(".ae-check").addEventListener("change", (e) => {
      if (!e.target.checked && actionSettings.filter(a => a.enabled).length <= 1) {
        e.target.checked = true; return;
      }
      actionSettings[idx].enabled = e.target.checked;
      renderActionEditor();
    });
    if (!isLocked) {
      row.querySelector(".ae-name-input").addEventListener("input", (e) => {
        actionSettings[idx].label = e.target.value;
      });
    }
    list.appendChild(row);
  });
}

// ── Custom Prompts ─────────────────────────────────────────────────────────────

let customPrompts = [];

function renderCustomPrompts() {
  const list = document.getElementById("custom-prompts-list");
  list.textContent = "";

  if (!customPrompts.length) {
    const hint = document.createElement("p");
    hint.className = "no-prompts hint";
    hint.textContent = "No custom prompts yet — add one below.";
    list.appendChild(hint);
    return;
  }

  customPrompts.forEach((p, i) => {
    const nameSpan = document.createElement("span");
    nameSpan.className = "cp-name";
    nameSpan.textContent = p.name;
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

  list.querySelectorAll(".cp-delete").forEach(btn => btn.addEventListener("click", () => {
    customPrompts = customPrompts.filter(p => p.id !== btn.dataset.id);
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
  list.querySelectorAll(".cp-up").forEach(btn => btn.addEventListener("click", () => {
    const idx = customPrompts.findIndex(p => p.id === btn.dataset.id);
    if (idx > 0) { [customPrompts[idx - 1], customPrompts[idx]] = [customPrompts[idx], customPrompts[idx - 1]]; renderCustomPrompts(); }
  }));
  list.querySelectorAll(".cp-down").forEach(btn => btn.addEventListener("click", () => {
    const idx = customPrompts.findIndex(p => p.id === btn.dataset.id);
    if (idx < customPrompts.length - 1) { [customPrompts[idx], customPrompts[idx + 1]] = [customPrompts[idx + 1], customPrompts[idx]]; renderCustomPrompts(); }
  }));
}

function addPrompt() {
  const name   = document.getElementById("new-prompt-name").value.trim();
  const prompt = document.getElementById("new-prompt-text").value.trim();
  if (!name || !prompt) { alert("Enter both a name and an instruction."); return; }
  if (customPrompts.length >= 8) { alert("Maximum 8 custom prompts."); return; }
  customPrompts.push({ id: uid(), name, prompt });
  renderCustomPrompts();
  document.getElementById("new-prompt-name").value = "";
  document.getElementById("new-prompt-text").value = "";
}

// ── History viewer ─────────────────────────────────────────────────────────────

async function loadHistoryViewer() {
  const { historyLog = [] } = await browser.storage.local.get("historyLog");
  const entries = purgeOldLog(historyLog);
  const section = document.getElementById("history-viewer-section");
  if (!section) return;

  if (!entries.length) { section.style.display = "none"; return; }
  section.style.display = "block";
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

  await cryptoSet({
    variants:       getVal("variants"),
    customPrompts,
    actionSettings,
    profileName:    getVal("profileName"),
    profileRole:    getVal("profileRole"),
    profileStyle:   getVal("profileStyle"),
    profileContext: getVal("profileContext"),
    profileEnabled: document.getElementById("profileEnabled")?.checked || false
  });
  syncWithDesktop().catch(() => {});
  const status = document.getElementById("save-status");
  status.textContent = "Saved!" + resetMsg;
  status.className   = "status-ok";
  setTimeout(() => { status.textContent = ""; }, resetMsg ? 5000 : 2000);
}

// ── Init ───────────────────────────────────────────────────────────────────────

async function init() {
  await migrateStorage();

  const s = await cryptoGet(STORAGE_KEYS);

  configuredProviders = s.configuredProviders || [];
  geminiModels        = s.geminiModels || [null, null, null];

  // Ollama is desktop-only — remove any legacy extension-side Ollama entries
  const preLen = configuredProviders.length;
  configuredProviders = configuredProviders.filter(p => p.id !== "ollama");
  if (configuredProviders.length !== preLen) saveProviders();

  renderProviderCards();

  // Wizard wiring
  document.getElementById("add-provider-btn").addEventListener("click", showWizard);
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

  // Variants
  const variantsVal = s.variants || 1;
  setVal("variants", variantsVal);
  document.getElementById("variants-display").textContent = variantsVal;
  document.getElementById("variants").addEventListener("input", e => {
    document.getElementById("variants-display").textContent = e.target.value;
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

// ── Pro gate ───────────────────────────────────────────────────────────────────

function applyProGates(isPro) {
  ["profile-section", "actions-section", "custom-prompts-section", "history-viewer-section"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle("locked", !isPro);
  });
  const histEl = document.getElementById("history-viewer-section");
  if (histEl) histEl.style.display = isPro ? "" : "none";

  const lockedView = document.getElementById("pro-locked-view");
  const activeView = document.getElementById("pro-active-view");
  if (lockedView) lockedView.style.display = isPro ? "none" : "";
  if (activeView) activeView.style.display = isPro ? ""     : "none";

  // Variants (Pro-only) — cap at 1 and reset if needed
  const variantsInput   = document.getElementById("variants");
  const variantsDisplay = document.getElementById("variants-display");
  if (variantsInput) {
    variantsInput.max = isPro ? 4 : 1;
    if (!isPro && parseInt(variantsInput.value) > 1) {
      variantsInput.value = 1;
      if (variantsDisplay) variantsDisplay.textContent = 1;
    }
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

  document.getElementById("pro-buy-link")?.addEventListener("click", () => {
    browser.tabs.create({ url: "https://panadauto.gumroad.com/l/thought-tidy" });
  });

  document.querySelectorAll(".pro-unlock-link").forEach(a => {
    a.addEventListener("click", () => {
      document.getElementById("pro-section")?.scrollIntoView({ behavior: "smooth" });
    });
  });

  document.getElementById("activate-pro-btn")?.addEventListener("click", async () => {
    const email = document.getElementById("pro-email-input")?.value?.trim();
    const key   = document.getElementById("pro-key-input")?.value?.trim();
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
  });

  document.getElementById("deactivate-pro-btn")?.addEventListener("click", async () => {
    await browser.storage.local.remove(["licenseEmail", "licenseKey"]);
    document.getElementById("pro-email-input").value = "";
    document.getElementById("pro-key-input").value   = "";
    applyProGates(false);
  });
}

const _yr = new Date().getFullYear();
document.getElementById("copyright-year").textContent = _yr > 2026 ? `2026–${_yr}` : "2026";

init();
