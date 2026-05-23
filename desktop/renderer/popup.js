// popup.js — Blur-to-Clear desktop popup renderer
// Uses storage-shim.js (provides `browser` compat) + btcAPI (via preload)

/* global browser, btcAPI, callAI, buildPromptWithProfile, MENU_PROMPTS, wordCount */

const KEY_FIELDS   = { openai: "openaiKey",   claude: "claudeKey",   gemini: "geminiKey"   };
const MODEL_FIELDS = { openai: "openaiModel",  claude: "claudeModel", gemini: "geminiModel" };
const DEFAULT_MODELS = {
  openai: "gpt-4o-mini",
  claude: "claude-haiku-4-5-20251001",
  gemini: "gemini-2.0-flash"
};

const STORAGE_KEYS = [
  "provider", "openaiKey", "claudeKey", "geminiKey",
  "openaiModel", "claudeModel", "geminiModel",
  "customPrompts", "lastAction",
  "profileName", "profileRole", "profileStyle", "profileContext", "profileEnabled"
];

let settings = {};

// ── Boot ───────────────────────────────────────────────────────────────────────

async function init() {
  settings = await browser.storage.local.get(STORAGE_KEYS);
  updateFooter();
  populateCustomActions();

  // Pre-fill from clipboard when popup is shown
  btcAPI.onPopupOpened(async () => {
    settings = await browser.storage.local.get(STORAGE_KEYS); // refresh
    updateFooter();
    const clipText = (await btcAPI.readClipboard()).trim();
    const textarea = document.getElementById("input-text");
    if (clipText && !textarea.value.trim()) {
      textarea.value = clipText;
      textarea.select();
    }
  });

  // Wire controls
  document.getElementById("close-btn").addEventListener("click",
    () => btcAPI.closePopup());

  document.getElementById("settings-btn").addEventListener("click",
    () => btcAPI.openSettings());

  document.getElementById("run-btn").addEventListener("click", runProcess);

  document.getElementById("input-text").addEventListener("keydown", (e) => {
    // Ctrl/Cmd + Enter triggers Run
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      runProcess();
    }
  });

  document.getElementById("copy-btn").addEventListener("click", async () => {
    const text = document.getElementById("result-text").textContent;
    await btcAPI.writeClipboard(text);
    const btn = document.getElementById("copy-btn");
    btn.textContent = "Copied!";
    setTimeout(() => (btn.textContent = "Copy to Clipboard"), 1600);
  });

  document.getElementById("copy-close-btn").addEventListener("click", async () => {
    const text = document.getElementById("result-text").textContent;
    await btcAPI.writeClipboard(text);
    btcAPI.closePopup();
  });

  // Escape hides the popup
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") btcAPI.closePopup();
  });
}

// ── Actions ────────────────────────────────────────────────────────────────────

function populateCustomActions() {
  const sel = document.getElementById("action-select");
  const cps = settings.customPrompts || [];
  if (cps.length) {
    const sep = document.createElement("option");
    sep.disabled = true;
    sep.textContent = "── Custom ──";
    sel.appendChild(sep);

    cps.slice(0, 8).forEach((cp, i) => {
      const opt = document.createElement("option");
      opt.value = `custom-${i}`;
      opt.textContent = `⚡ ${cp.name}`;
      sel.appendChild(opt);
    });
  }
  // Restore last-used action after all options are present
  sel.value = settings.lastAction || "fix-spelling";
}

async function runProcess() {
  const inputEl  = document.getElementById("input-text");
  const text     = inputEl.value.trim();
  if (!text) { inputEl.focus(); return; }

  const provider = settings.provider || "openai";
  const key      = settings[KEY_FIELDS[provider]];
  if (!key) {
    showResult(null, "No API key set for this provider — open Settings first.");
    return;
  }

  const actionVal = document.getElementById("action-select").value;
  const cps       = settings.customPrompts || [];
  let   systemPrompt;

  if (actionVal.startsWith("custom-")) {
    const idx    = parseInt(actionVal.replace("custom-", ""), 10);
    systemPrompt = cps[idx]?.prompt || "Process the following text:";
  } else {
    systemPrompt = MENU_PROMPTS[actionVal];
    if (!systemPrompt) return;
  }

  systemPrompt = buildPromptWithProfile(systemPrompt, settings);

  document.getElementById("run-btn").disabled = true;
  showLoading(true);

  try {
    const result = await callAI(provider, settings, systemPrompt, text);
    showResult(result, null);
    await browser.storage.local.set({ lastAction: actionVal });
  } catch (err) {
    showResult(null, err.message);
  } finally {
    document.getElementById("run-btn").disabled = false;
  }
}

// ── UI helpers ─────────────────────────────────────────────────────────────────

function showLoading(on) {
  document.getElementById("result-area").style.display = "block";
  document.getElementById("result-loading").style.display = on ? "flex" : "none";
  document.getElementById("result-text").textContent = "";
  document.getElementById("result-text").className   = "result-text";
  document.getElementById("result-actions").style.display = "none";
}

function showResult(text, error) {
  document.getElementById("result-loading").style.display = "none";
  const el = document.getElementById("result-text");
  if (error) {
    el.textContent = error;
    el.className   = "result-text is-error";
    document.getElementById("result-actions").style.display = "none";
  } else {
    el.textContent = text;
    el.className   = "result-text";
    document.getElementById("result-actions").style.display = "flex";
  }
}

function updateFooter() {
  const provider = settings.provider || "openai";
  const model    = settings[MODEL_FIELDS[provider]] || DEFAULT_MODELS[provider];
  const badge    = document.getElementById("provider-badge");
  const labels   = { openai: "OpenAI", claude: "Claude", gemini: "Gemini" };
  badge.textContent = `${labels[provider] || provider} · ${model}`;
}

async function loadHistory() {
  const raw     = await browser.storage.local.get("historyLog");
  const entries = purgeOldLog(raw.historyLog || []); // uses todayDate() internally

  const section = document.getElementById("history-section");
  if (!entries.length) { if (section) section.style.display = "none"; return; }

  section.style.display = "block";
  document.getElementById("history-count").textContent = entries.length;

  // Persistent toggle — no { once: true } so collapse also works
  document.getElementById("history-toggle").addEventListener("click", () => {
    const list = document.getElementById("history-list");
    list.style.display = list.style.display === "none" ? "block" : "none";
  });

  const list = document.getElementById("history-list");
  entries.slice(-10).reverse().forEach(e => {
    const item = document.createElement("div");
    item.className = "history-item";
    const t = new Date(e.timestamp);
    const time = `${String(t.getHours()).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")}`;
    const action = document.createElement("span");
    action.className = "history-action";
    action.textContent = e.action.replace(/-/g, " ");
    const meta = document.createElement("span");
    meta.textContent = `${time} · ${e.source}`;
    item.append(action, meta);
    list.appendChild(item);
  });
}

init().then(loadHistory);
