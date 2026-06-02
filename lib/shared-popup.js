// Shared popup logic — extension + desktop
// Requires: window.appGet, window.appSet, window.buildSlotActions, window.RUN_BTN_ID, window.POPUP_SOURCE

const BUILT_IN_AUDIENCE = [
  { value: "beginner",      label: "Beginner",      pro: false, prompt: "The recipient is a beginner. Use very simple language, avoid all jargon, and explain every concept." },
  { value: "basic",         label: "Basic",          pro: true,  prompt: "The recipient has basic familiarity. Keep language accessible and briefly explain any terms used." },
  { value: "moderate",      label: "Moderate",       pro: true,  prompt: "The recipient has moderate knowledge. Standard professional language is appropriate." },
  { value: "knowledgeable", label: "Knowledgeable",  pro: true,  prompt: "The recipient is experienced. Industry terms are fine; no need to over-explain." },
  { value: "expert",        label: "Expert",         pro: false, prompt: "The recipient is an expert. Be concise and direct — skip basic explanations." },
];

const PRO_ACTION_IDS = new Set(["sound-like-me", "sound-human", "formal", "casual", "shorten", "expand"]);

let _settings = {};

function setPopupSettings(s) { _settings = s; }
function getPopupSettings()  { return _settings; }

function populateAudienceSelect() {
  const sel = document.getElementById("context-audience-select");
  if (!sel) return;
  const isPro   = isProUnlocked(_settings);
  const presets = _settings.contextPresets || [];
  sel.innerHTML = '<option value="">— their knowledge level —</option>';
  BUILT_IN_AUDIENCE.forEach(a => {
    const opt = document.createElement("option");
    opt.value = a.value;
    if (a.pro && !isPro) { opt.textContent = a.label + " (Pro)"; opt.disabled = true; }
    else                  { opt.textContent = a.label; }
    sel.appendChild(opt);
  });
  if (isPro && presets.length) {
    const sep = document.createElement("option");
    sep.disabled = true; sep.textContent = "── Custom ──";
    sel.appendChild(sep);
    presets.forEach(p => {
      const opt = document.createElement("option");
      opt.value = "preset:" + p.id; opt.textContent = p.name;
      sel.appendChild(opt);
    });
  }
}

function buildAudiencePrompt() {
  const sel = document.getElementById("context-audience-select");
  if (!sel || !sel.value) return "";
  if (sel.value.startsWith("preset:")) {
    const id     = sel.value.slice(7);
    const preset = (_settings.contextPresets || []).find(p => p.id === id);
    return preset ? preset.text : "";
  }
  return BUILT_IN_AUDIENCE.find(a => a.value === sel.value)?.prompt || "";
}

function rebuildVariantsSelect() {
  const sel = document.getElementById("variants-select");
  if (!sel) return;
  const isPro = isProUnlocked(_settings);
  if (!isPro) { sel.style.display = "none"; return; }
  sel.style.display = "";
  const savedVal = parseInt(_settings.variants) || 1;
  sel.innerHTML = "";
  for (let i = 1; i <= 4; i++) {
    const opt = document.createElement("option");
    opt.value = String(i); opt.textContent = `×${i}`;
    sel.appendChild(opt);
  }
  sel.value = String(Math.max(1, Math.min(4, savedVal)));
}

function rebuildActionDropdown() {
  const sel = document.getElementById("action-select");
  if (!sel) return;
  const prevValue  = sel.value;
  sel.innerHTML    = "";
  const storedActs = resolveActionSettings(_settings.actionSettings || []);
  const cps        = _settings.customPrompts || [];
  const isPro      = isProUnlocked(_settings);
  const enabledActs = storedActs.filter(a => a.enabled);
  const freeEnabled = enabledActs.filter(a => !PRO_ACTION_IDS.has(a.id));
  const proEnabled  = enabledActs.filter(a =>  PRO_ACTION_IDS.has(a.id));
  freeEnabled.forEach(a => {
    const opt = document.createElement("option");
    opt.value = a.id; opt.textContent = a.label;
    sel.appendChild(opt);
  });
  if (proEnabled.length) {
    const sep = document.createElement("option");
    sep.disabled = true; sep.textContent = "── Pro ──";
    sel.appendChild(sep);
    proEnabled.forEach(a => {
      const opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = isPro ? a.label : a.label + " (Pro)";
      if (!isPro) opt.disabled = true;
      sel.appendChild(opt);
    });
  }
  if (cps.length) {
    const sep = document.createElement("option");
    sep.disabled = true; sep.textContent = "── Custom ──";
    sel.appendChild(sep);
    cps.slice(0, 8).forEach((cp, i) => {
      const opt = document.createElement("option");
      opt.value = `custom-${i}`; opt.textContent = `⚡ ${cp.name}`;
      sel.appendChild(opt);
    });
  }
  const lastAction = prevValue || _settings.lastAction || "";
  if (PRO_ACTION_IDS.has(lastAction) && !isPro) {
    sel.value = freeEnabled[0]?.id || "";
  } else {
    sel.value = lastAction;
    if (!sel.value || sel.value !== lastAction) sel.value = freeEnabled[0]?.id || "";
  }
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

function restoreContextAudience() {
  const audience = _settings.lastContextAudience;
  const sheet    = document.getElementById("context-sheet");
  const sel      = document.getElementById("context-audience-select");
  const btn      = document.getElementById("toggle-context-btn");
  const row      = document.querySelector(".ctx-toggle-row");
  if (_settings.contextEnabled === false) {
    if (row)   row.style.display = "none";
    if (sheet) sheet.style.display = "none";
    if (sel)   sel.value = "";
    if (btn)   { btn.textContent = "+ Add context"; btn.classList.remove("active"); }
    return;
  }
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

function wireContextSheetHandlers() {
  document.getElementById("toggle-context-btn")?.addEventListener("click", () => {
    const sheet  = document.getElementById("context-sheet");
    const btn    = document.getElementById("toggle-context-btn");
    const isOpen = sheet.style.display !== "none";
    sheet.style.display = isOpen ? "none" : "block";
    btn.textContent     = isOpen ? "+ Add context" : "− Context";
    btn.classList.toggle("active", !isOpen);
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
    window.appSet({ lastContextAudience: "" });
  });
}

function showLoading(on, count) {
  count = count || 1;
  document.getElementById("result-area").style.display = "block";
  document.getElementById("result-loading").style.display = on ? "flex" : "none";
  const loadingText = document.getElementById("result-loading-text");
  if (loadingText) loadingText.textContent = count > 1 ? `Getting suggestion 1 of ${count}…` : "Processing…";
  document.getElementById("result-slots").innerHTML = "";
  const clarifyArea = document.getElementById("clarify-area");
  if (clarifyArea) clarifyArea.style.display = "none";
}

function showResult(results, error) {
  document.getElementById("result-loading").style.display = "none";
  const slots = document.getElementById("result-slots");
  slots.innerHTML = "";
  if (error) {
    const el = document.createElement("div");
    el.className = "result-text result-error is-error";
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
    const btns = window.buildSlotActions(box, slot);
    btns.forEach(b => actions.appendChild(b));
    slot.appendChild(actions);
    slots.appendChild(slot);
  });
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
        _settings.configuredProviders, _settings.geminiModels, _settings,
        systemPrompt, `${originalText}\n\n---\nAdditional context:\n${answers}`
      );
      showResult([r.result], null);
    } catch (err) {
      showResult(null, err.message);
    } finally {
      document.getElementById(window.RUN_BTN_ID || "run-btn").disabled = false;
    }
  };
  btn.addEventListener("click", handler, { once: true });
}

async function runProcess() {
  const inputEl = document.getElementById("input-text");
  const text    = inputEl ? inputEl.value.trim() : "";
  if (!text) { if (inputEl) inputEl.focus(); return; }
  const actionVal = document.getElementById("action-select").value;
  const cps       = _settings.customPrompts || [];
  let   systemPrompt;
  let   isClarifyEnabled = false;
  if (actionVal.startsWith("custom-")) {
    const idx = parseInt(actionVal.replace("custom-", ""), 10);
    const cp  = cps[idx];
    systemPrompt = cp?.prompt || "Process the following text:";
    if (cp?.clarify) { isClarifyEnabled = true; systemPrompt = buildClarifyPrompt(systemPrompt); }
  } else {
    systemPrompt = MENU_PROMPTS[actionVal];
    if (!systemPrompt) return;
    if (actionVal === "brain-to-prompt") isClarifyEnabled = true;
  }
  systemPrompt = buildPromptWithProfile(systemPrompt, _settings);
  const contextSheet   = document.getElementById("context-sheet");
  const contextOpen    = contextSheet?.style.display !== "none";
  const audienceValue  = contextOpen ? (document.getElementById("context-audience-select")?.value || "") : "";
  const audiencePrompt = contextOpen ? buildAudiencePrompt() : "";
  if (audiencePrompt) systemPrompt += `\n\nAudience: ${audiencePrompt}`;
  await window.appSet({ lastContextAudience: audienceValue });
  const isPro  = isProUnlocked(_settings);
  const count  = actionVal === "fix-spelling" || !isPro
    ? 1
    : Math.max(1, Math.min(4, parseInt(document.getElementById("variants-select")?.value) || 1));
  const runBtnId = window.RUN_BTN_ID || "run-btn";
  document.getElementById(runBtnId).disabled = true;
  showLoading(true, count);
  try {
    const results     = [];
    let   usedProvider = "";
    let   usedModel    = "";
    const loadingText  = document.getElementById("result-loading-text");
    for (let i = 0; i < count; i++) {
      if (count > 1 && loadingText) loadingText.textContent = `Getting suggestion ${i + 1} of ${count}…`;
      const r = await callAIWithFallback(
        _settings.configuredProviders, _settings.geminiModels, _settings, systemPrompt, text
      );
      results.push(r.result);
      usedProvider = r.usedProvider;
      usedModel    = r.usedModel;
    }
    if (isClarifyEnabled && results.length === 1 && results[0].trimStart().startsWith("CLARIFY:")) {
      showClarify(results[0], text, systemPrompt);
      return;
    }
    showResult(results, null);
    await window.appSet({ lastAction: actionVal });
    const today       = todayDate();
    const stored      = await window.appGet(["historyFull"]);
    const historyFull = stored.historyFull || [];
    const cost        = estimateCost(usedModel, text, results);
    historyFull.push({
      id: uid(), timestamp: Date.now(), date: today,
      source: window.POPUP_SOURCE || "desktop",
      action: actionVal, provider: usedProvider, model: usedModel,
      systemPrompt: systemPrompt.slice(0, 2000),
      inputText: text.slice(0, 5000),
      outputs: results.map(r => r.slice(0, 5000)),
      ...cost
    });
    await window.appSet({ historyFull: historyFull.slice(-500) });
    if (typeof window.onRunComplete === "function") window.onRunComplete();
  } catch (err) {
    showResult(null, err.message);
  } finally {
    document.getElementById(window.RUN_BTN_ID || "run-btn").disabled = false;
  }
}
