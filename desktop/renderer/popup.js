// popup.js — Thought Tidy desktop popup renderer
// Uses storage-shim.js (provides `browser` compat) + btcAPI (via preload)

/* global browser, btcAPI, callAI, buildPromptWithProfile, MENU_PROMPTS, wordCount */

const PROVIDER_LABELS = { openai: "OpenAI", claude: "Claude", gemini: "Gemini" };

const STORAGE_KEYS = [
  "configuredProviders", "geminiModels",
  // legacy keys — passed to callAIWithFallback migration shim
  "provider", "openaiKey", "claudeKey", "geminiKey",
  "openaiModel", "claudeModel", "geminiModel",
  "variants", "customPrompts", "actionSettings", "lastAction",
  "profileName", "profileRole", "profileStyle", "profileContext", "profileEnabled",
  "licenseEmail", "licenseKey"
];

const PRO_ACTION_IDS = new Set(["sound-like-me", "improve", "formal", "casual", "shorten", "expand"]);

let settings = {};

// ── Boot ───────────────────────────────────────────────────────────────────────

async function init() {
  settings = await browser.storage.local.get(STORAGE_KEYS);
  updateFooter();
  populateCustomActions();
  document.getElementById("input-text").focus();

  // Refresh settings + UI each time the popup is shown
  btcAPI.onPopupOpened(async () => {
    settings = await browser.storage.local.get(STORAGE_KEYS);
    updateFooter();
    rebuildActionDropdown();
    document.getElementById("input-text").focus();
  });

  // Wire controls
  document.getElementById("close-btn").addEventListener("click",
    () => btcAPI.closePopup());

  document.getElementById("settings-btn").addEventListener("click",
    () => btcAPI.openSettings());

  document.getElementById("run-btn").addEventListener("click", runProcess);

  document.getElementById("paste-btn").addEventListener("click", async () => {
    const text = (await btcAPI.readClipboard()).trim();
    if (!text) return;
    const textarea = document.getElementById("input-text");
    textarea.value = text;
    textarea.focus();
    textarea.select();
  });

  document.getElementById("input-text").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      runProcess();
    }
  });

  // copy/close buttons are created dynamically in showResult()

  // Escape hides the popup
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") btcAPI.closePopup();
    // Block Ctrl+/- zoom — popup is a fixed-size window
    if (e.ctrlKey && (e.key === "+" || e.key === "-" || e.key === "=" || e.key === "0")) {
      e.preventDefault();
    }
  });
  document.addEventListener("wheel", (e) => {
    if (e.ctrlKey) e.preventDefault();
  }, { passive: false });
}

// ── Actions ────────────────────────────────────────────────────────────────────

function rebuildActionDropdown() {
  const sel        = document.getElementById("action-select");
  const prevValue  = sel.value;
  sel.innerHTML    = "";
  const storedActs = resolveActionSettings(settings.actionSettings || []);
  const cps        = settings.customPrompts || [];

  const isPro = isProUnlocked(settings);
  storedActs.filter(a => a.enabled).forEach(a => {
    const opt = document.createElement("option");
    opt.value = a.id;
    if (PRO_ACTION_IDS.has(a.id) && !isPro) {
      opt.textContent = a.label + " (Pro)";
      opt.disabled    = true;
    } else {
      opt.textContent = a.label;
    }
    sel.appendChild(opt);
  });
  if (cps.length) {
    const sep = document.createElement("option"); sep.disabled = true; sep.textContent = "── Custom ──";
    sel.appendChild(sep);
    cps.slice(0, 8).forEach((cp, i) => {
      const opt = document.createElement("option");
      opt.value = `custom-${i}`; opt.textContent = `⚡ ${cp.name}`;
      sel.appendChild(opt);
    });
  }
  const lastAction = prevValue || settings.lastAction || "";
  if (PRO_ACTION_IDS.has(lastAction) && !isPro) {
    sel.value = storedActs.find(a => a.enabled && !PRO_ACTION_IDS.has(a.id))?.id || "";
  } else {
    sel.value = lastAction;
    // Empty string or unrecognised value — fall back to first enabled action
    if (!sel.value || sel.value !== lastAction) sel.value = storedActs.find(a => a.enabled)?.id || "";
  }
}

function populateCustomActions() {
  rebuildActionDropdown();
}

async function runProcess() {
  const inputEl = document.getElementById("input-text");
  const text    = inputEl.value.trim();
  if (!text) { inputEl.focus(); return; }

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

  const isPro  = isProUnlocked(settings);
  const count  = actionVal === "fix-spelling" || !isPro
    ? 1
    : Math.max(1, Math.min(4, parseInt(settings.variants) || 1));

  document.getElementById("run-btn").disabled = true;
  showLoading(true, count);

  try {
    const results     = [];
    let usedProvider  = "";
    let usedModel     = "";
    const loadingText = document.getElementById("result-loading-text");
    for (let i = 0; i < count; i++) {
      if (count > 1 && loadingText) {
        loadingText.textContent = `Getting suggestion ${i + 1} of ${count}…`;
      }
      const r = await callAIWithFallback(
        settings.configuredProviders,
        settings.geminiModels,
        settings,
        systemPrompt,
        text
      );
      results.push(r.result);
      usedProvider = r.usedProvider;
      usedModel    = r.usedModel;
    }
    showResult(results, null);
    await browser.storage.local.set({ lastAction: actionVal });

    const today = todayDate();
    const { historyFull = [] } = await browser.storage.local.get("historyFull");
    const cost = estimateCost(usedModel, text, results);
    historyFull.push({
      id: uid(), timestamp: Date.now(), date: today, source: "desktop",
      action: actionVal, provider: usedProvider, model: usedModel,
      inputText: text.slice(0, 5000),
      outputs: results.map(r => r.slice(0, 5000)),
      ...cost
    });
    await browser.storage.local.set({ historyFull: historyFull.slice(-500) });
  } catch (err) {
    showResult(null, err.message);
  } finally {
    document.getElementById("run-btn").disabled = false;
  }
}

// ── UI helpers ─────────────────────────────────────────────────────────────────

function showLoading(on, count = 1) {
  document.getElementById("result-area").style.display = "block";
  document.getElementById("result-loading").style.display = on ? "flex" : "none";
  const loadingText = document.getElementById("result-loading-text");
  if (loadingText) loadingText.textContent = count > 1 ? `Getting suggestion 1 of ${count}…` : "Processing…";
  document.getElementById("result-slots").innerHTML = "";
}

function showResult(results, error) {
  document.getElementById("result-loading").style.display = "none";
  const slots = document.getElementById("result-slots");
  slots.innerHTML = "";

  if (error) {
    const el = document.createElement("div");
    el.className   = "result-text is-error";
    el.textContent = error;
    slots.appendChild(el);
    return;
  }

  results.forEach((text, i) => {
    const slot = document.createElement("div");
    slot.className = "result-slot";

    if (results.length > 1) {
      const label = document.createElement("div");
      label.className   = "result-slot-label";
      label.textContent = `Suggestion ${i + 1} of ${results.length}`;
      slot.appendChild(label);
    }

    const box = document.createElement("div");
    box.className       = "result-text";
    box.contentEditable = "true";
    box.spellcheck      = false;
    box.textContent     = text;
    slot.appendChild(box);

    const actions = document.createElement("div");
    actions.className = "result-actions";

    const copyBtn = document.createElement("button");
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", async () => {
      await btcAPI.writeClipboard(box.innerText);
      copyBtn.textContent = "Copied!";
      setTimeout(() => (copyBtn.textContent = "Copy"), 1600);
    });

    const copyCloseBtn = document.createElement("button");
    copyCloseBtn.className   = "copy-close-btn";
    copyCloseBtn.textContent = "Copy & Close";
    copyCloseBtn.addEventListener("click", async () => {
      await btcAPI.writeClipboard(box.innerText);
      btcAPI.closePopup();
    });

    actions.append(copyBtn, copyCloseBtn);
    slot.appendChild(actions);
    slots.appendChild(slot);
  });
}

function updateFooter() {
  const badge     = document.getElementById("provider-badge");
  const providers = settings.configuredProviders;
  if (Array.isArray(providers) && providers.length > 0) {
    const p     = providers[0];
    const label = PROVIDER_LABELS[p.id] || p.id;
    const model = p.id === "gemini"
      ? (settings.geminiModels?.find(Boolean) || p.model || "")
      : (p.model || "");
    badge.textContent = model ? `${label} · ${model}` : label;
  } else {
    badge.textContent = "No provider. Open Settings";
  }
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
