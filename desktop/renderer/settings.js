// settings.js — Blur-to-Clear desktop settings renderer
// Shares provider management logic with the extension options.js via the storage shim.
// browser.storage.local calls go through storage-shim.js → btcAPI → electron-store.

/* global browser, btcAPI, costTier, fetchOpenAIModels, fetchClaudeModels, fetchGeminiModels,
          testOpenAI, testClaude, testGemini, uid, escHtml, isModelCacheStale, formatCacheAge */

const STORAGE_KEYS = [
  "configuredProviders", "geminiModels",
  "provider", "openaiKey", "openaiModel", "claudeKey", "claudeModel", "geminiKey", "geminiModel",
  "variants", "customPrompts", "actionSettings",
  "profileName", "profileRole", "profileStyle", "profileContext", "profileEnabled"
];

const FETCHERS = { openai: fetchOpenAIModels, claude: fetchClaudeModels, gemini: fetchGeminiModels };
const TESTERS  = { openai: testOpenAI,        claude: testClaude,        gemini: testGemini };

const PROVIDER_INFO = {
  openai: { name: "ChatGPT (OpenAI)",   sub: "GPT-4o, o1, o3…",     keyPlaceholder: "sk-…",    keyUrl: "https://platform.openai.com/api-keys" },
  claude: { name: "Claude (Anthropic)", sub: "Haiku, Sonnet, Opus…", keyPlaceholder: "sk-ant-…",keyUrl: "https://console.anthropic.com/settings/keys" },
  gemini: { name: "Gemini (Google)",    sub: "2.0 Flash, 1.5 Pro…",  keyPlaceholder: "AIza…",   keyUrl: "https://aistudio.google.com/app/apikey" }
};

// ── In-memory provider state ───────────────────────────────────────────────────

let configuredProviders = [];
let geminiModels        = [null, null, null];
let wizardProvider      = null;
let isDirty             = false;

// ── Wire external links (Electron can't use <a href> target="_blank") ──────────

function wireLinks() {
  const links = {
    "link-github":      "https://github.com/Bheck890/Blur-to-Clear",
    "link-issues":      "https://github.com/Bheck890/Blur-to-Clear/issues",
    "link-license":     "https://opensource.org/licenses/MIT",
    "link-author":      "https://github.com/Bheck890",
    "link-footer-github": "https://github.com/Bheck890/Blur-to-Clear"
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
      <div class="field">
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
      </div>
      ${modelEditHtml}
      <div class="pc-edit-actions">
        <button class="pc-btn pc-remove-btn">Remove</button>
        <div style="display:flex;gap:8px">
          <button class="pc-btn pc-cancel-edit-btn">Cancel</button>
          <button class="pc-btn btn-primary pc-save-edit-btn">Save</button>
        </div>
      </div>
    </div>`;

  card.querySelector(".pc-key-input").value = p.apiKey;

  // "Get key" link via btcAPI
  card.querySelector(".pc-key-link")?.addEventListener("click", () => btcAPI.openURL(info.keyUrl));

  // Show/hide key
  const showBtn  = card.querySelector(".pc-show-btn");
  const keyInput = card.querySelector(".pc-key-input");
  showBtn.addEventListener("click", () => {
    keyInput.type       = keyInput.type === "password" ? "text" : "password";
    showBtn.textContent = keyInput.type === "password" ? "Show" : "Hide";
  });

  // Test & load models
  card.querySelector(".pc-test-btn").addEventListener("click", async () => {
    const key     = keyInput.value.trim();
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

  // Refresh
  card.querySelector(".pc-refresh-btn")?.addEventListener("click", async () => {
    const key = keyInput.value.trim();
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
}

function showWizardStep2(providerId) {
  wizardProvider = providerId;
  const info = PROVIDER_INFO[providerId];
  document.getElementById("wizard-provider-title").textContent = info.name;
  document.getElementById("wizard-api-key").placeholder       = info.keyPlaceholder;
  document.getElementById("wizard-gemini-extra").style.display = providerId === "gemini" ? "block" : "none";

  // Wire the "Get key" link via btcAPI
  const keyLink = document.getElementById("wizard-key-link");
  if (keyLink) {
    keyLink.onclick = null;
    keyLink.addEventListener("click", () => btcAPI.openURL(info.keyUrl));
  }

  document.getElementById("wizard-step-1").style.display = "none";
  document.getElementById("wizard-step-2").style.display = "block";
  document.getElementById("wizard-api-key").focus();
}

async function wizardTestAndLoad() {
  if (!wizardProvider) return;
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
  else         { statusEl.textContent = "Key validation failed — check key and retry."; statusEl.className = "fetch-status status-error"; }
}

async function saveWizardProvider() {
  const apiKey   = document.getElementById("wizard-api-key").value.trim();
  const statusEl = document.getElementById("wizard-key-status");
  if (!apiKey) { statusEl.textContent = "Enter an API key first."; statusEl.className = "fetch-status status-error"; return; }

  if (configuredProviders.find(p => p.id === wizardProvider)) {
    const name = PROVIDER_INFO[wizardProvider]?.name || wizardProvider;
    statusEl.textContent = `${name} is already configured — use Edit on its card to update it.`;
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
    const isLocked  = LOCKED_ACTIONS.has(action.id);
    const isOnlyOne = action.enabled && enabledCount === 1;
    const row = document.createElement("div");
    row.className = `ae-row${!action.enabled ? " ae-disabled" : ""}`;

    const ordHtml = `
      <div class="ae-order">
        <button class="ae-ord-btn ae-up" ${idx === 0 ? "disabled" : ""}                     title="Move up">▲</button>
        <button class="ae-ord-btn ae-dn" ${idx === actionSettings.length - 1 ? "disabled" : ""} title="Move down">▼</button>
      </div>`;
    const checkHtml = `<input type="checkbox" class="ae-check" ${action.enabled ? "checked" : ""}
      ${isOnlyOne ? "disabled title='At least one action must stay enabled'" : ""}>`;
    const labelHtml = isLocked
      ? `<span class="ae-label">${escHtml(action.label)}</span><span class="ae-lock-badge">built-in</span>`
      : `<input class="ae-name-input" value="${escHtml(action.label)}" placeholder="Action name"><span class="ae-lock-badge"></span>`;

    row.innerHTML = ordHtml + checkHtml + labelHtml;

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

// ── Custom prompts ─────────────────────────────────────────────────────────────

let customPrompts = [];

function renderCustomPrompts() {
  const list = document.getElementById("custom-prompts-list");
  list.textContent = "";
  if (!customPrompts.length) {
    const p = document.createElement("p");
    p.className = "no-prompts hint"; p.textContent = "No custom prompts yet — add one below.";
    list.appendChild(p); return;
  }
  customPrompts.forEach((p, i) => {
    const nameSpan  = document.createElement("span"); nameSpan.className = "cp-name"; nameSpan.textContent = p.name;
    const orderSpan = document.createElement("span"); orderSpan.className = "cp-order"; orderSpan.textContent = `#${i + 1} in menu`;
    const meta = document.createElement("div"); meta.className = "cp-meta"; meta.append(nameSpan, orderSpan);
    const textDiv = document.createElement("div"); textDiv.className = "cp-text";
    textDiv.textContent = p.prompt.length > 100 ? p.prompt.slice(0, 100) + "…" : p.prompt;
    const mkBtn = (cls, label) => { const btn = document.createElement("button"); btn.className = `cp-btn ${cls}`; btn.dataset.id = p.id; btn.textContent = label; return btn; };
    const actions = document.createElement("div"); actions.className = "cp-actions";
    actions.append(mkBtn("cp-edit", "Edit"), mkBtn("cp-delete", "Delete"));
    if (i > 0)                        actions.appendChild(mkBtn("cp-up",   "↑"));
    if (i < customPrompts.length - 1) actions.appendChild(mkBtn("cp-down", "↓"));
    const item = document.createElement("div"); item.className = "cp-item"; item.dataset.id = p.id;
    item.append(meta, textDiv, actions); list.appendChild(item);
  });
  list.querySelectorAll(".cp-delete").forEach(btn => btn.addEventListener("click", () => { customPrompts = customPrompts.filter(p => p.id !== btn.dataset.id); renderCustomPrompts(); }));
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
    row.innerHTML = `
      <span class="hv-time">${time}</span>
      <span class="hv-action">${e.action.replace(/-/g, " ")}</span>
      <span class="hv-meta">${[e.provider, e.model].filter(Boolean).join(" · ")}</span>
      <span class="hv-words">${e.inputLen || 0} → ${e.outputLen || 0} chars</span>`;
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
    resetMsg       = ` Note: your last action was disabled — switched to "${first?.label || resolvedAction}".`;
    await browser.storage.local.set({ lastAction: resolvedAction });
  }

  await browser.storage.local.set({
    variants:       getVal("variants"),
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

// ── Init ───────────────────────────────────────────────────────────────────────

async function init() {
  wireLinks();

  // TEST ONLY banner + version label + update notice via IPC
  if (typeof btcAPI !== "undefined" && btcAPI.getAppConfig) {
    const config = await btcAPI.getAppConfig();
    if (config.isTestBuild) {
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
        link.textContent = `Version ${config.updateAvailable.version} available — Download from GitHub ↗`;
        link.addEventListener("click", () => btcAPI.openURL(config.updateAvailable.url));
        notice.style.display = "block";
      }
    }
  }

  await migrateStorage();
  const s = await browser.storage.local.get(STORAGE_KEYS);
  configuredProviders = s.configuredProviders || [];
  geminiModels        = s.geminiModels || [null, null, null];

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
  const wzKey  = document.getElementById("wizard-api-key");
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
    btcAPI.openHistory();
  });

  document.getElementById("save-btn").addEventListener("click", save);
  document.getElementById("revert-btn").addEventListener("click", () => {
    if (confirm("Discard unsaved changes and reload settings?")) location.reload();
  });

  // Track unsaved changes — any input/change event on the page marks it dirty
  document.querySelector(".page").addEventListener("input",  () => { isDirty = true; });
  document.querySelector(".page").addEventListener("change", () => { isDirty = true; });

  // Warn before closing with unsaved changes
  window.addEventListener("beforeunload", e => {
    if (isDirty) e.returnValue = "";
  });
}

init();
