const STORAGE_KEYS = [
  "provider",
  "openaiKey", "openaiModel",
  "claudeKey", "claudeModel",
  "geminiKey", "geminiModel",
  "variants", "customPrompts",
  "profileName", "profileRole", "profileStyle", "profileContext", "profileEnabled"
];

// Model fetchers and testers come from lib/models.js (loaded in options.html)
const FETCHERS = { openai: fetchOpenAIModels, claude: fetchClaudeModels, gemini: fetchGeminiModels };
const TESTERS  = { openai: testOpenAI,        claude: testClaude,        gemini: testGemini };

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
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.label;
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

    const msg = skipped > 0
      ? `${working.length}/${allModels.length} models verified (${skipped} unavailable)`
      : `All ${working.length} models verified ✓`;
    setStatus(provider, msg, "ok");

  } catch (err) {
    setStatus(provider, `Error: ${err.message}`, "error");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Refresh"; }
  }
}

// uid() and escHtml() come from lib/text.js (loaded in options.html)

// ── Custom Prompts ────────────────────────────────────────────────────────────

let customPrompts = [];

function renderCustomPrompts() {
  const list = document.getElementById("custom-prompts-list");
  if (!customPrompts.length) {
    list.innerHTML = '<p class="no-prompts hint">No custom prompts yet — add one below.</p>';
    return;
  }
  list.innerHTML = customPrompts.map((p, i) => `
    <div class="cp-item" data-id="${p.id}">
      <div class="cp-meta">
        <span class="cp-name">${escHtml(p.name)}</span>
        <span class="cp-order">#${i + 1} in menu</span>
      </div>
      <div class="cp-text">${escHtml(p.prompt.length > 100 ? p.prompt.slice(0, 100) + "…" : p.prompt)}</div>
      <div class="cp-actions">
        <button class="cp-btn cp-edit" data-id="${p.id}">Edit</button>
        <button class="cp-btn cp-delete" data-id="${p.id}">Delete</button>
        ${i > 0 ? `<button class="cp-btn cp-up" data-id="${p.id}">↑</button>` : ""}
        ${i < customPrompts.length - 1 ? `<button class="cp-btn cp-down" data-id="${p.id}">↓</button>` : ""}
      </div>
    </div>
  `).join("");

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

  // Keys — set values, then auto-fetch if key already saved
  const providers = ["openai", "claude", "gemini"];
  for (const p of providers) {
    const keyField = document.getElementById(`${p}Key`);
    const savedKey = s[`${p}Key`] || "";
    keyField.value = savedKey;

    // Auto-fetch when user leaves the key field (blur) if key is non-empty
    keyField.addEventListener("blur", () => {
      if (keyField.value.trim()) doFetch(p);
    });

    // If we already have a saved key, auto-fetch on load to populate models
    if (savedKey) {
      const savedModel = s[`${p}Model`] || "";
      doFetch(p).then(() => {
        // Re-apply saved model after fetch in case it got overridden
        if (savedModel) {
          const sel = document.getElementById(`${p}Model`);
          if (sel && [...sel.options].some(o => o.value === savedModel)) sel.value = savedModel;
        }
      });
    }
  }

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
}

function updateCardHighlight() {
  const selected = document.querySelector('input[name="provider"]:checked')?.value;
  document.querySelectorAll(".radio-card").forEach(card => {
    card.classList.toggle("selected", card.querySelector("input").value === selected);
  });
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
