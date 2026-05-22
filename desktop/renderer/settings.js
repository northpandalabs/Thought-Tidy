// settings.js — Blur-to-Clear desktop settings renderer
// Shares the same logic as the extension options.js via the storage shim.
// browser.storage.local calls go through storage-shim.js → btcAPI → electron-store.

/* global browser, btcAPI, costTier, fetchOpenAIModels, fetchClaudeModels, fetchGeminiModels,
          testOpenAI, testClaude, testGemini, uid, escHtml */

const STORAGE_KEYS = [
  "provider",
  "openaiKey", "openaiModel",
  "claudeKey", "claudeModel",
  "geminiKey", "geminiModel",
  "variants", "customPrompts",
  "profileName", "profileRole", "profileStyle", "profileContext", "profileEnabled"
];

const FETCHERS = { openai: fetchOpenAIModels, claude: fetchClaudeModels, gemini: fetchGeminiModels };
const TESTERS  = { openai: testOpenAI,        claude: testClaude,        gemini: testGemini };

// ── Wire external links (no <a href> in Electron — use btcAPI.openURL) ─────────
function wireLinks() {
  const links = {
    "link-github":      "https://github.com/Bheck890/BrainFix-AI",
    "link-issues":      "https://github.com/Bheck890/BrainFix-AI/issues",
    "link-license":     "https://opensource.org/licenses/MIT",
    "link-author":      "https://github.com/Bheck890",
    "link-openai-key":  "https://platform.openai.com/api-keys",
    "link-claude-key":  "https://console.anthropic.com/settings/keys",
    "link-gemini-key":  "https://aistudio.google.com/app/apikey",
    "link-footer-github": "https://github.com/Bheck890/BrainFix-AI"
  };
  for (const [id, url] of Object.entries(links)) {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", () => btcAPI.openURL(url));
  }
}

// ── Status helper ──────────────────────────────────────────────────────────────
function setStatus(provider, msg, type) {
  const el = document.getElementById(`${provider}-status`);
  if (!el) return;
  el.textContent = msg;
  el.className = `fetch-status status-${type}`;
}

// ── Model select ───────────────────────────────────────────────────────────────
function populateSelect(selectId, models, currentValue) {
  const sel = document.getElementById(selectId);
  if (!sel || !models.length) return;
  sel.innerHTML = "";
  models.forEach(m => {
    const tier = costTier(m.id);
    const opt  = document.createElement("option");
    opt.value       = m.id;
    opt.textContent = `${m.label}  ${tier}`;
    sel.appendChild(opt);
  });
  sel.value    = (currentValue && models.find(m => m.id === currentValue)) ? currentValue : models[0].id;
  sel.disabled = false;
}

// ── Fetch + test models ────────────────────────────────────────────────────────
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
    const allModels    = await FETCHERS[provider](apiKey);
    if (!allModels.length) throw new Error("No compatible models returned.");
    setStatus(provider, `Testing ${allModels.length} models…`, "loading");

    const results = await Promise.all(
      allModels.map(async m => (await TESTERS[provider](apiKey, m.id)) ? m : null)
    );
    const working = results.filter(Boolean);
    const skipped = allModels.length - working.length;
    if (!working.length) throw new Error("No models responded. Check your API key.");

    populateSelect(`${provider}Model`, working, currentModel);
    setStatus(provider,
      skipped > 0
        ? `${working.length}/${allModels.length} models verified (${skipped} unavailable)`
        : `All ${working.length} models verified ✓`,
      "ok"
    );
  } catch (err) {
    setStatus(provider, `Error: ${err.message}`, "error");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Refresh"; }
  }
}

async function doFetchAndSaveKey(provider) {
  const keyField = document.getElementById(`${provider}Key`);
  const key      = keyField.value.trim();
  if (!key) return;

  await doFetch(provider);

  const sel = document.getElementById(`${provider}Model`);
  if (sel && sel.options.length && sel.options[0].value !== "") {
    keyField.readOnly = true;
    const editBtn = document.querySelector(`.edit-key-btn[data-provider="${provider}"]`);
    if (editBtn) editBtn.style.display = "inline-flex";
    document.getElementById("setup-wizard").style.display = "none";
    await browser.storage.local.set({
      [`${provider}Key`]:   key,
      [`${provider}Model`]: sel.value
    });
  }
}

// ── Custom prompts ─────────────────────────────────────────────────────────────
let customPrompts = [];

function renderCustomPrompts() {
  const list = document.getElementById("custom-prompts-list");
  list.textContent = "";

  if (!customPrompts.length) {
    const p = document.createElement("p");
    p.className   = "no-prompts hint";
    p.textContent = "No custom prompts yet — add one below.";
    list.appendChild(p);
    return;
  }

  customPrompts.forEach((p, i) => {
    const nameSpan  = document.createElement("span");
    nameSpan.className   = "cp-name";
    nameSpan.textContent = p.name;
    const orderSpan = document.createElement("span");
    orderSpan.className   = "cp-order";
    orderSpan.textContent = `#${i + 1} in menu`;
    const meta = document.createElement("div");
    meta.className = "cp-meta";
    meta.append(nameSpan, orderSpan);

    const textDiv = document.createElement("div");
    textDiv.className   = "cp-text";
    textDiv.textContent = p.prompt.length > 100 ? p.prompt.slice(0, 100) + "…" : p.prompt;

    const mkBtn = (cls, label) => {
      const btn = document.createElement("button");
      btn.className   = `cp-btn ${cls}`;
      btn.dataset.id  = p.id;
      btn.textContent = label;
      return btn;
    };
    const actions = document.createElement("div");
    actions.className = "cp-actions";
    actions.append(mkBtn("cp-edit", "Edit"), mkBtn("cp-delete", "Delete"));
    if (i > 0)                        actions.appendChild(mkBtn("cp-up",   "↑"));
    if (i < customPrompts.length - 1) actions.appendChild(mkBtn("cp-down", "↓"));

    const item = document.createElement("div");
    item.className  = "cp-item";
    item.dataset.id = p.id;
    item.append(meta, textDiv, actions);
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

// ── Save / revert ──────────────────────────────────────────────────────────────
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
  status.className   = "status-ok";
  setTimeout(() => { status.textContent = ""; }, 2000);
}

function getVal(id) { return document.getElementById(id)?.value ?? ""; }
function setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v; }

// ── Provider card highlight ────────────────────────────────────────────────────
function updateCardHighlight() {
  const selected = document.querySelector('input[name="provider"]:checked')?.value;
  document.querySelectorAll(".radio-card").forEach(card => {
    card.classList.toggle("selected", card.querySelector("input").value === selected);
  });
}

// ── Init ───────────────────────────────────────────────────────────────────────
async function init() {
  wireLinks();

  const s = await browser.storage.local.get(STORAGE_KEYS);

  // Show wizard if no key at all
  const hasKey = s.openaiKey || s.claudeKey || s.geminiKey;
  if (!hasKey) document.getElementById("setup-wizard").style.display = "block";

  // Provider
  const providerVal = s.provider || "openai";
  document.querySelectorAll('input[name="provider"]').forEach(r => {
    r.checked = r.value === providerVal;
    r.addEventListener("change", updateCardHighlight);
  });
  updateCardHighlight();

  // Keys + lock/edit flow
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

    if (editBtn) {
      editBtn.addEventListener("click", () => {
        if (!confirm(`Changing your ${p.toUpperCase()} key will re-test all models (a few API calls). Continue?`)) return;
        keyField.readOnly = false;
        keyField.value    = "";
        editBtn.style.display = "none";
        setStatus(p, "Enter new key and press Enter", "loading");
        keyField.focus();
      });
    }

    keyField.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); doFetchAndSaveKey(p); }
    });
    keyField.addEventListener("blur", () => {
      if (keyField.value.trim() && !keyField.readOnly) doFetchAndSaveKey(p);
    });

    if (savedKey) {
      const savedModel = s[`${p}Model`] || "";
      doFetch(p, true).then(() => {
        if (savedModel) {
          const sel = document.getElementById(`${p}Model`);
          if (sel && [...sel.options].some(o => o.value === savedModel)) sel.value = savedModel;
        }
      });
    }
  }

  // Show/hide key buttons
  document.querySelectorAll(".show-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.target);
      if (input.type === "password") { input.type = "text";     btn.textContent = "Hide"; }
      else                           { input.type = "password"; btn.textContent = "Show"; }
    });
  });

  // Manual refresh
  document.querySelectorAll(".fetch-btn[data-provider]").forEach(btn => {
    btn.addEventListener("click", () => doFetch(btn.dataset.provider));
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

  // Save / Revert
  document.getElementById("save-btn").addEventListener("click", save);
  document.getElementById("revert-btn").addEventListener("click", () => {
    if (confirm("Discard unsaved changes and reload settings?")) location.reload();
  });
}

init();
