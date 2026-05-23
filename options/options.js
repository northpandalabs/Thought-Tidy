const STORAGE_KEYS = [
  "provider",
  "openaiKey", "openaiModel", "openaiModels", "openaiModelsLastFetched",
  "claudeKey", "claudeModel", "claudeModels", "claudeModelsLastFetched",
  "geminiKey", "geminiModel", "geminiModels", "geminiModelsLastFetched",
  "variants", "customPrompts",
  "profileName", "profileRole", "profileStyle", "profileContext", "profileEnabled"
];

// Model fetchers, testers, and cache helpers come from lib/models.js (loaded in options.html)
const FETCHERS = { openai: fetchOpenAIModels, claude: fetchClaudeModels, gemini: fetchGeminiModels };
const TESTERS  = { openai: testOpenAI,        claude: testClaude,        gemini: testGemini };

// Updates the Refresh button label/title to reflect cache age or staleness.
function showCacheStatus(provider, fetchedAt) {
  const btn = document.querySelector(`.fetch-btn[data-provider="${provider}"]`);
  if (!btn) return;
  if (!fetchedAt || isModelCacheStale(fetchedAt)) {
    btn.textContent = "⚠ Refresh";
    btn.title = fetchedAt ? "Model list may be outdated — click to refresh" : "No model list cached yet";
  } else {
    btn.textContent = "Refresh";
    btn.title = `Last updated: ${formatCacheAge(fetchedAt)}`;
  }
}

// ── Fetch + test + populate ───────────────────────────────────────────────────

function setStatus(provider, msg, type) {
  const el = document.getElementById(`${provider}-status`);
  if (!el) return;
  el.textContent = msg;
  el.className = `fetch-status status-${type}`;
}

function populateSelect(selectId, models, currentValue) {
  const sel = document.getElementById(selectId);
  if (!sel || !models.length) return;
  sel.innerHTML = "";
  models.forEach(m => {
    const tier = costTier(m.id); // from lib/models.js
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = `${m.label}  ${tier}`;
    sel.appendChild(opt);
  });
  sel.value = (currentValue && models.find(m => m.id === currentValue)) ? currentValue : models[0].id;
  sel.disabled = false;
}

async function doFetch(provider, silent = false) {
  const apiKey = document.getElementById(`${provider}Key`)?.value?.trim();
  if (!apiKey) {
    if (!silent) setStatus(provider, "Enter an API key first.", "error");
    return;
  }

  const btn = document.querySelector(`.fetch-btn[data-provider="${provider}"]`);
  if (btn) { btn.disabled = true; btn.textContent = "Fetching…"; }
  setStatus(provider, "Fetching model list…", "loading");

  try {
    const currentModel = document.getElementById(`${provider}Model`)?.value;
    const allModels = await FETCHERS[provider](apiKey);
    if (!allModels.length) throw new Error("No compatible models returned.");

    setStatus(provider, `Testing ${allModels.length} models…`, "loading");

    const results = await Promise.all(
      allModels.map(async m => (await TESTERS[provider](apiKey, m.id)) ? m : null)
    );
    const working = results.filter(Boolean);
    const skipped = allModels.length - working.length;

    if (!working.length) throw new Error("No models responded successfully. Check your API key.");

    populateSelect(`${provider}Model`, working, currentModel);

    const now = Date.now();
    await browser.storage.local.set({
      [`${provider}Models`]:            working,
      [`${provider}ModelsLastFetched`]: now
    });
    showCacheStatus(provider, now);

    const msg = skipped > 0
      ? `${working.length}/${allModels.length} models verified (${skipped} unavailable)`
      : `All ${working.length} models verified ✓`;
    setStatus(provider, msg, "ok");

  } catch (err) {
    setStatus(provider, `Error: ${err.message}`, "error");
  } finally {
    if (btn) { btn.disabled = false; }
  }
}

// Test key, populate models, and immediately persist the key + chosen model
async function doFetchAndSaveKey(provider) {
  const keyField = document.getElementById(`${provider}Key`);
  const key = keyField.value.trim();
  if (!key) return;

  await doFetch(provider);

  // If fetch succeeded (models populated), lock the field and save
  const sel = document.getElementById(`${provider}Model`);
  if (sel && sel.options.length && sel.options[0].value !== "") {
    keyField.readOnly = true;
    const editBtn = document.querySelector(`.edit-key-btn[data-provider="${provider}"]`);
    if (editBtn) editBtn.style.display = "inline-flex";
    document.getElementById("setup-wizard").style.display = "none";
    await browser.storage.local.set({
      [`${provider}Key`]:   key,
      [`${provider}Model`]: sel.value,
      provider              // auto-switch active provider to the one just configured
    });
    const radio = document.querySelector(`input[name="provider"][value="${provider}"]`);
    if (radio) { radio.checked = true; updateCardHighlight(); }
    updateProviderAvailability();
  }
}

// uid() and escHtml() come from lib/text.js (loaded in options.html)

// ── Custom Prompts ────────────────────────────────────────────────────────────

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

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  const s = await browser.storage.local.get(STORAGE_KEYS);

  // Provider radio
  const providerVal = s.provider || "openai";
  document.querySelectorAll('input[name="provider"]').forEach(r => {
    r.checked = r.value === providerVal;
    r.addEventListener("change", updateCardHighlight);
  });
  updateCardHighlight();

  // Show first-run wizard if no keys saved at all
  const hasAnyKey = s.openaiKey || s.claudeKey || s.geminiKey;
  if (!hasAnyKey) document.getElementById("setup-wizard").style.display = "block";

  // Keys — set values, lock if saved, wire edit/test flow
  const providers = ["openai", "claude", "gemini"];
  for (const p of providers) {
    const keyField = document.getElementById(`${p}Key`);
    const editBtn  = document.querySelector(`.edit-key-btn[data-provider="${p}"]`);
    const savedKey = s[`${p}Key`] || "";
    keyField.value = savedKey;

    if (savedKey) {
      keyField.readOnly = true;
      if (editBtn) editBtn.style.display = "inline-flex";
    }

    // Edit button: warn then unlock
    if (editBtn) {
      editBtn.addEventListener("click", () => {
        if (!confirm(`Changing your ${p.toUpperCase()} key will re-test all models (a few API calls). Continue?`)) return;
        keyField.readOnly = false;
        keyField.value = "";
        keyField.type = "password";
        editBtn.style.display = "none";
        setStatus(p, "Enter new key and press Enter", "loading");
        browser.storage.local.set({ [`${p}Models`]: [], [`${p}ModelsLastFetched`]: 0 });
        showCacheStatus(p, 0);
        keyField.focus();
        updateProviderAvailability();
      });
    }

    // Press Enter in key field → test immediately
    keyField.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); doFetchAndSaveKey(p); }
    });

    // Auto-fetch on blur if key changed
    keyField.addEventListener("blur", () => {
      if (keyField.value.trim() && !keyField.readOnly) doFetchAndSaveKey(p);
    });

    // Load model list from cache — no API call on settings open
    const cachedModels = s[`${p}Models`] || [];
    const cachedAt     = s[`${p}ModelsLastFetched`] || 0;
    const savedModel   = s[`${p}Model`] || "";
    if (cachedModels.length) {
      populateSelect(`${p}Model`, cachedModels, savedModel);
    }
    showCacheStatus(p, cachedAt);
  }

  updateProviderAvailability();

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
    const url = document.getElementById("contextUrl")?.value?.trim();
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
      statusEl.className = "fetch-status status-ok";
    } catch (err) {
      statusEl.textContent = `Failed: ${err.message}. Check the URL is public and returns plain text.`;
      statusEl.className = "fetch-status status-error";
    } finally {
      btn.disabled = false; btn.textContent = "Fetch & Save";
    }
  });

  // Custom prompts
  customPrompts = s.customPrompts || [];
  renderCustomPrompts();
  document.getElementById("add-prompt-btn").addEventListener("click", addPrompt);

  // Example prompt buttons
  document.querySelectorAll(".example-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.getElementById("new-prompt-name").value = btn.dataset.name;
      document.getElementById("new-prompt-text").value = btn.dataset.prompt;
    });
  });

  // Show/hide key buttons
  document.querySelectorAll(".show-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.target);
      if (input.type === "password") { input.type = "text";     btn.textContent = "Hide"; }
      else                           { input.type = "password"; btn.textContent = "Show"; }
    });
  });

  // Manual refresh buttons (only the provider ones, not fetch-context-btn)
  document.querySelectorAll(".fetch-btn[data-provider]").forEach(btn => {
    btn.addEventListener("click", () => doFetch(btn.dataset.provider));
  });

  document.getElementById("save-btn").addEventListener("click", save);
  document.getElementById("revert-btn").addEventListener("click", () => {
    if (confirm("Discard unsaved changes and reload settings?")) location.reload();
  });

  // TEST ONLY banner (driven by build-flags.js loaded in HTML)
  if (typeof BUILD_FLAGS !== 'undefined' && BUILD_FLAGS.testBuild) {
    const banner = document.getElementById('test-only-banner');
    if (banner) banner.style.display = 'block';
  }

  // Update notice (driven by storage key written by background.js at noon)
  const { updateAvailable } = await browser.storage.local.get('updateAvailable');
  if (updateAvailable && updateAvailable.version) {
    const notice = document.getElementById('update-notice');
    const link   = document.getElementById('update-link');
    if (notice && link) {
      link.textContent = `Version ${updateAvailable.version} available — Download from GitHub ↗`;
      link.href        = updateAvailable.url;
      notice.style.display = 'block';
    }
  }
}

function updateCardHighlight() {
  const selected = document.querySelector('input[name="provider"]:checked')?.value;
  document.querySelectorAll(".radio-card").forEach(card => {
    card.classList.toggle("selected", card.querySelector("input").value === selected);
  });
}

function updateProviderAvailability() {
  for (const p of ["openai", "claude", "gemini"]) {
    const keyField = document.getElementById(`${p}Key`);
    const card     = document.getElementById(`card-${p}`);
    const radio    = card?.querySelector("input");
    if (!card || !radio || !keyField) continue;

    const hasKey      = !!(keyField.value.trim());
    radio.disabled    = !hasKey;
    card.style.opacity = hasKey ? "1" : "0.45";
    card.style.cursor  = hasKey ? "pointer" : "not-allowed";
    card.title         = hasKey ? "" : "Enter an API key for this provider to enable it";

    if (!hasKey && radio.checked) {
      const first = document.querySelector('input[name="provider"]:not(:disabled)');
      if (first) {
        first.checked = true;
        browser.storage.local.set({ provider: first.value });
        updateCardHighlight();
      }
    }
  }
}

async function save() {
  const provider = document.querySelector('input[name="provider"]:checked')?.value || "openai";
  await browser.storage.local.set({
    provider,
    openaiKey:      getVal("openaiKey"),
    openaiModel:    getVal("openaiModel"),
    claudeKey:      getVal("claudeKey"),
    claudeModel:    getVal("claudeModel"),
    geminiKey:      getVal("geminiKey"),
    geminiModel:    getVal("geminiModel"),
    variants:       getVal("variants"),
    customPrompts,
    profileName:    getVal("profileName"),
    profileRole:    getVal("profileRole"),
    profileStyle:   getVal("profileStyle"),
    profileContext: getVal("profileContext"),
    profileEnabled: document.getElementById("profileEnabled")?.checked || false
  });
  const status = document.getElementById("save-status");
  status.textContent = "Saved!";
  status.className = "status-ok";
  setTimeout(() => { status.textContent = ""; }, 2000);
}

function getVal(id) { return document.getElementById(id)?.value ?? ""; }
function setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v; }

init();
