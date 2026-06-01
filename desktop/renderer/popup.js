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
  "licenseEmail", "licenseKey", "showContextField", "contextText", "contextLevel", "contextPresets",
  "lastContextAudience"
];

const PRO_ACTION_IDS = new Set(["sound-like-me", "improve", "formal", "casual", "shorten", "expand"]);

let settings = {};

// ── Boot ───────────────────────────────────────────────────────────────────────

const BUILT_IN_AUDIENCE = [
  { value: "beginner",      label: "Beginner",      pro: false, prompt: "The recipient is a beginner. Use very simple language, avoid all jargon, and explain every concept." },
  { value: "basic",         label: "Basic",          pro: true,  prompt: "The recipient has basic familiarity. Keep language accessible and briefly explain any terms used." },
  { value: "moderate",      label: "Moderate",       pro: true,  prompt: "The recipient has moderate knowledge. Standard professional language is appropriate." },
  { value: "knowledgeable", label: "Knowledgeable",  pro: true,  prompt: "The recipient is experienced. Industry terms are fine; no need to over-explain." },
  { value: "expert",        label: "Expert",         pro: false, prompt: "The recipient is an expert. Be concise and direct — skip basic explanations." },
];

function restoreContextAudience() {
  const audience = settings.lastContextAudience;
  const sheet    = document.getElementById("context-sheet");
  const sel      = document.getElementById("context-audience-select");
  const btn      = document.getElementById("toggle-context-btn");
  if (audience) {
    if (sheet) sheet.style.display = "block";
    if (sel)   sel.value = audience;
    if (btn)   { btn.textContent = "− Context"; btn.classList.add("active"); }
  } else {
    if (sheet) sheet.style.display = "none";
    if (sel)   sel.value = "";
    if (btn)   { btn.textContent = "+ Add context"; btn.classList.remove("active"); }
    const helpEl  = document.getElementById("ctx-help-text");
    const helpBtn = document.getElementById("ctx-help-btn");
    if (helpEl)  helpEl.style.display = "none";
    if (helpBtn) helpBtn.classList.remove("active");
  }
}

function populateContextSheet() {
  const sel    = document.getElementById("context-audience-select");
  if (!sel) return;
  const isPro  = isProUnlocked(settings);
  const presets = settings.contextPresets || [];

  sel.innerHTML = '<option value="">— their knowledge level —</option>';
  BUILT_IN_AUDIENCE.forEach(a => {
    const opt = document.createElement("option");
    opt.value = a.value;
    if (a.pro && !isPro) {
      opt.textContent = a.label + " (Pro)";
      opt.disabled    = true;
    } else {
      opt.textContent = a.label;
    }
    sel.appendChild(opt);
  });

  if (isPro && presets.length) {
    const sep = document.createElement("option");
    sep.disabled = true; sep.textContent = "── Custom ──";
    sel.appendChild(sep);
    presets.forEach(p => {
      const opt = document.createElement("option");
      opt.value       = "preset:" + p.id;
      opt.textContent = p.name;
      sel.appendChild(opt);
    });
  }
}

function buildAudiencePrompt() {
  const sel = document.getElementById("context-audience-select");
  if (!sel || !sel.value) return "";
  if (sel.value.startsWith("preset:")) {
    const id     = sel.value.slice(7);
    const preset = (settings.contextPresets || []).find(p => p.id === id);
    return preset ? preset.text : "";
  }
  return BUILT_IN_AUDIENCE.find(a => a.value === sel.value)?.prompt || "";
}

async function init() {
  settings = await browser.storage.local.get(STORAGE_KEYS);
  updateFooter();
  populateCustomActions();
  populateContextSheet();
  restoreContextAudience();
  document.getElementById("input-text").focus();

  // Refresh settings + UI each time the popup is shown
  btcAPI.onPopupOpened(async () => {
    settings = await browser.storage.local.get(STORAGE_KEYS);
    updateFooter();
    rebuildActionDropdown();
    populateContextSheet();
    restoreContextAudience();
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

  document.getElementById("toggle-context-btn")?.addEventListener("click", () => {
    const sheet     = document.getElementById("context-sheet");
    const btn       = document.getElementById("toggle-context-btn");
    const isOpen    = sheet.style.display !== "none";
    if (isOpen) {
      sheet.style.display = "none";
      btn.textContent = "+ Add context";
      btn.classList.remove("active");
    } else {
      sheet.style.display = "block";
      btn.textContent = "− Context";
      btn.classList.add("active");
    }
  });

  document.getElementById("ctx-help-btn")?.addEventListener("click", () => {
    const helpEl = document.getElementById("ctx-help-text");
    const btn    = document.getElementById("ctx-help-btn");
    if (!helpEl) return;
    const open = helpEl.style.display === "none";
    helpEl.style.display = open ? "block" : "none";
    btn.classList.toggle("active", open);
  });

  document.getElementById("context-skip-btn")?.addEventListener("click", () => {
    const sheet   = document.getElementById("context-sheet");
    const sel     = document.getElementById("context-audience-select");
    const btn     = document.getElementById("toggle-context-btn");
    const helpEl  = document.getElementById("ctx-help-text");
    const helpBtn = document.getElementById("ctx-help-btn");
    if (sheet)   sheet.style.display = "none";
    if (sel)     sel.value = "";
    if (btn)     { btn.textContent = "+ Add context"; btn.classList.remove("active"); }
    if (helpEl)  helpEl.style.display = "none";
    if (helpBtn) helpBtn.classList.remove("active");
    browser.storage.local.set({ lastContextAudience: "" });
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

  const contextSheet   = document.getElementById("context-sheet");
  const contextOpen    = contextSheet?.style.display !== "none";
  const audienceValue  = contextOpen ? (document.getElementById("context-audience-select")?.value || "") : "";
  const audiencePrompt = contextOpen ? buildAudiencePrompt() : "";
  if (audiencePrompt) {
    systemPrompt += `\n\nAudience: ${audiencePrompt}`;
  }
  await browser.storage.local.set({ lastContextAudience: audienceValue });

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
      systemPrompt: systemPrompt.slice(0, 2000),
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
