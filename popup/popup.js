const PROVIDER_LABELS = { openai: "OpenAI", claude: "Claude", gemini: "Gemini" };

const STORAGE_KEYS = [
  "configuredProviders", "geminiModels",
  // legacy keys — passed to callAIWithFallback migration shim
  "provider", "openaiKey", "claudeKey", "geminiKey",
  "openaiModel", "claudeModel", "geminiModel",
  "variants", "customPrompts", "actionSettings", "lastAction",
  "profileName", "profileRole", "profileStyle", "profileContext", "profileEnabled",
  "licenseEmail", "licenseKey", "contextPresets", "contextEnabled", "lastContextAudience",
  "themeMode"
];

const BUILT_IN_AUDIENCE = [
  { value: "beginner",      label: "Beginner",      pro: false, prompt: "The recipient is a beginner. Use very simple language, avoid all jargon, and explain every concept." },
  { value: "basic",         label: "Basic",          pro: true,  prompt: "The recipient has basic familiarity. Keep language accessible and briefly explain any terms used." },
  { value: "moderate",      label: "Moderate",       pro: true,  prompt: "The recipient has moderate knowledge. Standard professional language is appropriate." },
  { value: "knowledgeable", label: "Knowledgeable",  pro: true,  prompt: "The recipient is experienced. Industry terms are fine; no need to over-explain." },
  { value: "expert",        label: "Expert",         pro: false, prompt: "The recipient is an expert. Be concise and direct — skip basic explanations." },
];

function populateAudienceSelect(settings) {
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

function buildAudiencePrompt(settings) {
  const sel = document.getElementById("context-audience-select");
  if (!sel || !sel.value) return "";
  if (sel.value.startsWith("preset:")) {
    const id     = sel.value.slice(7);
    const preset = (settings.contextPresets || []).find(p => p.id === id);
    return preset ? preset.text : "";
  }
  return BUILT_IN_AUDIENCE.find(a => a.value === sel.value)?.prompt || "";
}

const PRO_ACTION_IDS = new Set(["sound-like-me", "sound-human", "formal", "casual", "shorten", "expand"]);

let currentSettings = {};

function rebuildVariantsSelect(settings, isPro) {
  const sel = document.getElementById("variants-select");
  if (!sel) return;
  if (!isPro) {
    sel.style.display = "none";
    return;
  }
  sel.style.display = "";
  const savedVal = parseInt(settings.variants) || 1;
  sel.innerHTML = "";
  for (let i = 1; i <= 4; i++) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `×${i}`;
    sel.appendChild(opt);
  }
  sel.value = String(Math.max(1, Math.min(4, savedVal)));
}

function initTextareaAutogrow() {
  const ta = document.getElementById("input-text");
  if (!ta) return;
  const maxH   = () => window.innerHeight * 0.5;
  const resize = () => {
    ta.style.height    = "auto";
    const h            = Math.min(ta.scrollHeight, maxH());
    ta.style.height    = h + "px";
    ta.style.overflowY = ta.scrollHeight > maxH() ? "auto" : "hidden";
  };
  ta.addEventListener("input", resize);
  ta.addEventListener("focus", resize);
  resize();
}

async function init() {
  currentSettings = await cryptoGet(STORAGE_KEYS);

  document.documentElement.setAttribute("data-theme", currentSettings.themeMode || "dark");

  const isPro = isProUnlocked(currentSettings);
  rebuildVariantsSelect(currentSettings, isPro);

  updateProviderStatus(currentSettings);

  populateAudienceSelect(currentSettings);
  initTextareaAutogrow();

  // Hide the "+ Add context" row if the user has disabled it in settings
  if (currentSettings.contextEnabled === false) {
    const row = document.querySelector(".ctx-toggle-row");
    if (row) row.style.display = "none";
  }

  // Restore last-used context audience (skip if user disabled context in settings)
  if (currentSettings.contextEnabled !== false && currentSettings.lastContextAudience) {
    const sheet = document.getElementById("context-sheet");
    const sel   = document.getElementById("context-audience-select");
    const btn   = document.getElementById("toggle-context-btn");
    if (sheet) sheet.style.display = "block";
    if (sel)   sel.value = currentSettings.lastContextAudience;
    if (btn)   { btn.textContent = "− Context"; btn.classList.add("active"); }
  }

  document.getElementById("toggle-context-btn")?.addEventListener("click", () => {
    const sheet  = document.getElementById("context-sheet");
    const btn    = document.getElementById("toggle-context-btn");
    const isOpen = sheet.style.display !== "none";
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

  // Populate action dropdown from actionSettings (user-ordered/enabled list) + custom prompts
  const actionSel   = document.getElementById("action-select");
  const storedActs  = resolveActionSettings(currentSettings.actionSettings || []);
  const cps         = currentSettings.customPrompts || [];

  const enabledActs = storedActs.filter(a => a.enabled);
  const freeEnabled = enabledActs.filter(a => !PRO_ACTION_IDS.has(a.id));
  const proEnabled  = enabledActs.filter(a =>  PRO_ACTION_IDS.has(a.id));

  freeEnabled.forEach(a => {
    const opt = document.createElement("option");
    opt.value = a.id;
    opt.textContent = a.label;
    actionSel.appendChild(opt);
  });
  if (proEnabled.length) {
    const sep = document.createElement("option");
    sep.disabled = true; sep.textContent = "── Pro ──";
    actionSel.appendChild(sep);
    proEnabled.forEach(a => {
      const opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = isPro ? a.label : a.label + " (Pro)";
      if (!isPro) opt.disabled = true;
      actionSel.appendChild(opt);
    });
  }
  if (cps.length) {
    const sep = document.createElement("option"); sep.disabled = true; sep.textContent = "── Custom ──";
    actionSel.appendChild(sep);
    cps.slice(0, 8).forEach((cp, i) => {
      const opt = document.createElement("option");
      opt.value = `custom-${i}`; opt.textContent = `⚡ ${cp.name}`;
      actionSel.appendChild(opt);
    });
  }
  const lastAction = currentSettings.lastAction || "";
  if (PRO_ACTION_IDS.has(lastAction) && !isPro) {
    actionSel.value = freeEnabled[0]?.id || "fix-spelling";
  } else {
    actionSel.value = actionSel.querySelector(`option[value="${lastAction}"]`) ? lastAction : (freeEnabled[0]?.id || "");
  }

  // Setup CTA: shown when no providers configured
  const providers   = currentSettings.configuredProviders;
  const hasProvider = Array.isArray(providers) && providers.length > 0;
  const hasLegacyKey = currentSettings.openaiKey || currentSettings.claudeKey || currentSettings.geminiKey;
  const ctaEl = document.getElementById("setup-cta");
  if (ctaEl) ctaEl.style.display = (hasProvider || hasLegacyKey) ? "none" : "block";

  document.getElementById("variants-select")?.addEventListener("change", (e) => {
    browser.storage.local.set({ variants: e.target.value });
  });

  document.getElementById("open-settings").addEventListener("click", () => {
    browser.runtime.openOptionsPage();
  });
  document.getElementById("open-settings-cta")?.addEventListener("click", () => {
    browser.runtime.openOptionsPage();
  });

  document.getElementById("process-btn").addEventListener("click", runProcess);
  document.getElementById("run-selection-btn").addEventListener("click", runFromSelection);

  const { historyLog: rawLog = [] } = await browser.storage.local.get("historyLog");
  const purged = purgeOldLog(rawLog);
  if (purged.length !== rawLog.length) await browser.storage.local.set({ historyLog: purged });
  loadHistory();
}

async function runFromSelection() {
  const btn    = document.getElementById("run-selection-btn");
  const status = document.getElementById("run-selection-status");
  status.style.display = "none";
  btn.disabled = true;
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab.");

    const [{ result: selectedText }] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString()?.trim() || ""
    });

    if (!selectedText) {
      status.textContent = "No text selected on the page. Highlight text first.";
      status.style.display = "block";
      return;
    }

    const actionVal = document.getElementById("action-select").value;
    await browser.runtime.sendMessage({ type: "run-from-popup", tabId: tab.id, actionVal, selectedText });
    await browser.storage.local.set({ lastAction: actionVal });
    window.close();
  } catch (err) {
    status.textContent = err.message;
    status.style.display = "block";
  } finally {
    btn.disabled = false;
  }
}

async function runProcess() {
  const text = document.getElementById("input-text").value.trim();
  if (!text) return;

  const actionVal = document.getElementById("action-select").value;
  const cps       = currentSettings.customPrompts || [];
  let systemPrompt;
  let isClarifyEnabled = false;
  if (actionVal.startsWith("custom-")) {
    const idx = parseInt(actionVal.replace("custom-", ""), 10);
    const cp  = cps[idx];
    systemPrompt = cp?.prompt || "Process the following text:";
    if (cp?.clarify) {
      isClarifyEnabled = true;
      systemPrompt = buildClarifyPrompt(systemPrompt);
    }
  } else {
    systemPrompt = MENU_PROMPTS[actionVal];
    if (!systemPrompt) return;
    if (actionVal === "brain-to-prompt") isClarifyEnabled = true;
  }
  systemPrompt = buildPromptWithProfile(systemPrompt, currentSettings);

  const contextSheet   = document.getElementById("context-sheet");
  const contextOpen    = contextSheet?.style.display !== "none";
  const audienceValue  = contextOpen ? (document.getElementById("context-audience-select")?.value || "") : "";
  const audiencePrompt = contextOpen ? buildAudiencePrompt(currentSettings) : "";
  if (audiencePrompt) {
    systemPrompt += `\n\nAudience: ${audiencePrompt}`;
  }
  await browser.storage.local.set({ lastContextAudience: audienceValue });

  const isPro  = isProUnlocked(currentSettings);
  const count  = actionVal === "fix-spelling" || !isPro
    ? 1
    : Math.max(1, Math.min(4, parseInt(document.getElementById("variants-select")?.value) || 1));

  document.getElementById("process-btn").disabled = true;
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
        currentSettings.configuredProviders,
        currentSettings.geminiModels,
        currentSettings,
        systemPrompt,
        text
      );
      results.push(r.result);
      usedProvider = r.usedProvider;
      usedModel    = r.usedModel;
    }
    // CLARIFY detection — for brain-to-prompt and clarify-enabled custom actions
    if (isClarifyEnabled && results.length === 1 && results[0].trimStart().startsWith("CLARIFY:")) {
      showClarify(results[0], text, systemPrompt);
      return;
    }

    showResult(results, null);
    await browser.storage.local.set({ lastAction: actionVal });

    const today = todayDate();
    const { historyFull = [] } = await browser.storage.local.get("historyFull");
    const cost = estimateCost(usedModel, text, results);
    historyFull.push({
      id: uid(), timestamp: Date.now(), date: today, source: "extension",
      action: actionVal, provider: usedProvider, model: usedModel,
      systemPrompt: systemPrompt.slice(0, 2000),
      inputText: text.slice(0, 5000),
      outputs: results.map(r => r.slice(0, 5000)),
      ...cost
    });
    await browser.storage.local.set({ historyFull: historyFull.slice(-500) });
  } catch (err) {
    showResult(null, `Error: ${err.message}`);
  } finally {
    document.getElementById("process-btn").disabled = false;
  }
}

function showLoading(on, count = 1) {
  document.getElementById("result-area").style.display = "block";
  document.getElementById("result-loading").style.display = on ? "flex" : "none";
  const loadingText = document.getElementById("result-loading-text");
  if (loadingText) loadingText.textContent = count > 1 ? `Getting suggestion 1 of ${count}…` : "Processing…";
  document.getElementById("result-slots").innerHTML = "";
  const clarifyArea = document.getElementById("clarify-area");
  if (clarifyArea) clarifyArea.style.display = "none";
}

function showClarify(clarifyText, originalText, systemPrompt) {
  document.getElementById("result-loading").style.display = "none";
  document.getElementById("result-slots").innerHTML = "";
  const area = document.getElementById("clarify-area");
  const qEl  = document.getElementById("clarify-questions");
  if (!area || !qEl) { showResult([clarifyText], null); return; }

  const lines = clarifyText.replace(/^CLARIFY:\n?/i, "").split("\n")
    .map(l => l.replace(/^[•\-*\d.]+\s*/, "").trim()).filter(Boolean);
  qEl.innerHTML = "";
  lines.forEach(q => {
    const p = document.createElement("p");
    p.className = "clarify-question"; p.textContent = q;
    qEl.appendChild(p);
  });
  document.getElementById("clarify-answers").value = "";
  area.style.display = "block";

  const btn = document.getElementById("clarify-submit-btn");
  const handler = async () => {
    const answers = document.getElementById("clarify-answers").value.trim();
    if (!answers) return;
    area.style.display = "none";
    showLoading(true, 1);
    try {
      const r = await callAIWithFallback(
        currentSettings.configuredProviders,
        currentSettings.geminiModels,
        currentSettings,
        systemPrompt,
        `${originalText}\n\n---\nAdditional context:\n${answers}`
      );
      showResult([r.result], null);
    } catch (err) {
      showResult(null, `Error: ${err.message}`);
    } finally {
      document.getElementById("process-btn").disabled = false;
    }
  };
  btn.addEventListener("click", handler, { once: true });
}

function showResult(results, error) {
  document.getElementById("result-loading").style.display = "none";
  const slots = document.getElementById("result-slots");
  slots.innerHTML = "";

  if (error) {
    const el = document.createElement("div");
    el.className   = "result-text result-error";
    el.setAttribute("role", "alert");
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
    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(box.innerText).catch(() => {});
      copyBtn.textContent = "Copied!";
      setTimeout(() => (copyBtn.textContent = "Copy"), 1600);
    });

    const useBtn = document.createElement("button");
    useBtn.className   = "replace-btn";
    useBtn.textContent = "Use this ↑";
    useBtn.addEventListener("click", () => {
      document.getElementById("input-text").value = box.innerText || "";
      document.getElementById("result-area").style.display = "none";
      slots.innerHTML = "";
    });

    actions.append(copyBtn, useBtn);
    slot.appendChild(actions);
    slots.appendChild(slot);
  });
}

function updateProviderStatus(settings) {
  const providers = settings.configuredProviders;
  const dot  = document.getElementById("key-indicator");
  const text = document.getElementById("key-text");
  if (!dot || !text) return;

  const hasNew    = Array.isArray(providers) && providers.length > 0;
  const hasLegacy = settings.openaiKey || settings.claudeKey || settings.geminiKey;

  if (hasNew) {
    dot.className    = "dot dot-ok";
    const names      = providers.map(p => PROVIDER_LABELS[p.id] || p.id).join(" → ");
    text.textContent = `Priority: ${names}`;
  } else if (hasLegacy) {
    dot.className    = "dot dot-ok";
    text.textContent = "API key set";
  } else {
    dot.className    = "dot dot-bad";
    text.textContent = "No providers configured. Open Settings";
  }
}

async function loadHistory() {
  const { historyLog = [] } = await browser.storage.local.get("historyLog");
  const entries = purgeOldLog(historyLog);

  const section = document.getElementById("history-section");
  if (!entries.length) { if (section) section.style.display = "none"; return; }

  section.style.display = "block";
  document.getElementById("history-count").textContent = entries.length;

  document.getElementById("history-toggle").addEventListener("click", () => {
    const list = document.getElementById("history-list");
    list.style.display = list.style.display === "none" ? "block" : "none";
  });

  const list = document.getElementById("history-list");
  entries.slice(-10).reverse().forEach(e => {
    const item = document.createElement("div");
    item.className = "history-item";
    const t    = new Date(e.timestamp);
    const time = `${String(t.getHours()).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")}`;
    const action = document.createElement("span");
    action.className   = "history-action";
    action.textContent = e.action.replace(/-/g, " ");
    const meta = document.createElement("span");
    meta.textContent = `${time} · ${e.source}`;
    item.append(action, meta);
    list.appendChild(item);
  });
}

init();
