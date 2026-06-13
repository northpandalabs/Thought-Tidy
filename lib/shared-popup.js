// Shared popup logic — extension + desktop
// Requires: window.appGet, window.appSet, window.buildSlotActions, window.RUN_BTN_ID, window.POPUP_SOURCE

const BUILT_IN_AUDIENCE = [
  { value: "beginner",      label: "Beginner",      pro: false, prompt: "The recipient is a beginner. Use very simple language, avoid all jargon, and explain every concept." },
  { value: "basic",         label: "Basic",          pro: true,  prompt: "The recipient has basic familiarity. Keep language accessible and briefly explain any terms used." },
  { value: "moderate",      label: "Moderate",       pro: true,  prompt: "The recipient has moderate knowledge. Standard professional language is appropriate." },
  { value: "knowledgeable", label: "Knowledgeable",  pro: true,  prompt: "The recipient is experienced. Industry terms are fine; no need to over-explain." },
  { value: "expert",        label: "Expert",         pro: false, prompt: "The recipient is an expert. Be concise and direct — skip basic explanations." },
];

const PRO_ACTION_IDS = new Set(["sound-like-me", "sound-human", "formal", "casual", "shorten", "expand", "clarity-check"]);

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
  const actionVal = document.getElementById("action-select")?.value;
  const ccBtn = document.getElementById("clarity-check-btn");
  if (ccBtn) {
    ccBtn.style.display = isPro ? "" : "none";
    ccBtn.classList.toggle("active", actionVal === "clarity-check");
  }
  if (!isPro || actionVal === "fix-spelling" || actionVal === "clarity-check") { sel.style.display = "none"; return; }
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
    if (!isPro) {
      const sep = document.createElement("option");
      sep.disabled = true; sep.textContent = "── Pro ──";
      sel.appendChild(sep);
    }
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
  if (!sel._variantsWired) {
    sel._variantsWired = true;
    sel.addEventListener("change", rebuildVariantsSelect);
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
  ta.addEventListener("input", () => {
    resize();
    const resultArea = document.getElementById("result-area");
    if (resultArea && resultArea.style.display !== "none") {
      resultArea.style.display = "none";
      const slotsEl = document.getElementById("result-slots");
      if (slotsEl) slotsEl.innerHTML = "";
      const clarifyEl = document.getElementById("clarify-area");
      if (clarifyEl) clarifyEl.style.display = "none";
    }
  });
  ta.addEventListener("focus", resize);
  ta.addEventListener("paste", (e) => {
    const html  = e.clipboardData?.getData("text/html");
    const plain = e.clipboardData?.getData("text/plain") || "";
    if (!html && !plain) return;
    e.preventDefault();
    const cleaned = cleanPastedText(html || plain, !!html);
    insertAtCaret(ta, cleaned);
    ta.dispatchEvent(new Event("input"));
  });
  resize();
}

function cleanPastedText(raw, isHtml) {
  let text = raw;
  if (isHtml) {
    const doc = new DOMParser().parseFromString(raw, "text/html");
    // Replace <br> and block-level tags with newlines before extracting text
    doc.querySelectorAll("br").forEach(el => el.replaceWith("\n"));
    doc.querySelectorAll("p, div, li, tr, blockquote, h1, h2, h3, h4, h5, h6").forEach(el => {
      if (el.nextSibling) el.after("\n");
    });
    text = doc.body.innerText || doc.body.textContent || "";
  }
  // Strip zero-width / invisible characters injected by Teams / Outlook
  text = text.replace(/[​‌‍﻿]/g, "");
  // Normalise non-breaking spaces to regular spaces
  text = text.replace(/ /g, " ");
  // Trim trailing whitespace on each line
  text = text.split("\n").map(l => l.trimEnd()).join("\n");
  // Collapse runs of 3+ blank lines down to 2
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

function insertAtCaret(ta, text) {
  const start = ta.selectionStart;
  const end   = ta.selectionEnd;
  ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
  ta.selectionStart = ta.selectionEnd = start + text.length;
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

function wireClarityCheckBtn() {
  const btn = document.getElementById("clarity-check-btn");
  if (!btn || btn._wired) return;
  btn._wired = true;
  btn.addEventListener("click", () => {
    const actionSel = document.getElementById("action-select");
    if (actionSel) actionSel.value = "clarity-check";
    rebuildVariantsSelect();
    document.getElementById(window.RUN_BTN_ID || "run-btn")?.click();
  });
}

function showLoading(on, count) {
  count = count || 1;
  document.getElementById("result-area").style.display = "block";
  document.getElementById("result-loading").style.display = on ? "flex" : "none";
  const loadingText = document.getElementById("result-loading-text");
  if (loadingText) loadingText.textContent = count > 1 ? `Getting suggestion 1 of ${count}…` : "Processing…";
  document.getElementById("result-expand-btn")?.remove();
  if (window.POPUP_SOURCE !== "desktop") document.body.style.width = "";
  const slots = document.getElementById("result-slots");
  slots.innerHTML = "";
  slots.classList.remove("multi-col");
  const clarifyArea = document.getElementById("clarify-area");
  if (clarifyArea) clarifyArea.style.display = "none";
}

function showResult(results, error) {
  document.getElementById("result-loading").style.display = "none";
  document.getElementById("result-expand-btn")?.remove();
  const slots = document.getElementById("result-slots");
  slots.innerHTML = "";
  if (error) {
    const el = document.createElement("div");
    el.className = "result-text result-error is-error";
    el.setAttribute("role", "alert");
    el.textContent = error;
    slots.appendChild(el);
    document.getElementById("result-area").style.display = "block";
    return;
  }
  const normalized = results.map(t => (t || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n"));

  // 3+ results in extension: open in a new tab
  if (normalized.length >= 3 && window.POPUP_SOURCE === "extension") {
    const hasTabsAPI = typeof browser !== "undefined" && typeof browser.tabs !== "undefined";
    if (hasTabsAPI) {
      browser.storage.local.set({ expandedResults: { results: normalized, timestamp: Date.now() } })
        .then(() => browser.tabs.create({ url: browser.runtime.getURL("popup/results.html") }));
      const notice = document.createElement("div");
      notice.className = "result-text";
      notice.style.cssText = "background:var(--accent-bg);border-color:var(--accent);text-align:center;max-height:none;cursor:pointer;";
      notice.textContent = `Opened ${normalized.length} suggestions in a new tab →`;
      notice.addEventListener("click", () => browser.tabs.create({ url: browser.runtime.getURL("popup/results.html") }));
      slots.appendChild(notice);
      document.getElementById("result-area").style.display = "block";
      return;
    }
  }

  document.getElementById("result-area").style.display = "block";
  normalized.forEach((text, i) => {
    const slot = document.createElement("div");
    slot.className = "result-slot";
    if (normalized.length > 1) {
      const label = document.createElement("div");
      label.className   = "result-slot-label";
      label.textContent = `Suggestion ${i + 1} of ${normalized.length}`;
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
    if (box.scrollHeight > box.clientHeight) {
      const toggleBtn = document.createElement("button");
      toggleBtn.className   = "result-toggle-btn";
      toggleBtn.textContent = "⇕";
      toggleBtn.title       = "Expand / collapse";
      toggleBtn.addEventListener("click", () => {
        const isExp = box.dataset.expanded === "1";
        box.dataset.expanded  = isExp ? "0" : "1";
        box.style.maxHeight   = isExp ? "140px" : "none";
        box.style.overflowY   = isExp ? "auto" : "visible";
        toggleBtn.classList.toggle("expanded", !isExp);
      });
      actions.appendChild(toggleBtn);
    }
  });

  // 2+ results → expand/stack toggle; 3+ auto-expands into columns immediately
  if (normalized.length >= 2) {
    const colCount = normalized.length;
    const isDesktop = window.POPUP_SOURCE === "desktop" && typeof btcAPI !== "undefined";
    const resize = (n) => {
      if (isDesktop) {
        if (typeof btcAPI.resizePopup === "function") btcAPI.resizePopup(n);
      } else {
        document.body.style.width = n > 1 ? (n * 320) + "px" : "";
      }
    };
    const expandBtn = document.createElement("button");
    expandBtn.id = "result-expand-btn";
    expandBtn.dataset.colCount = String(colCount);
    const autoExpand = colCount >= 3;
    expandBtn.dataset.expanded = autoExpand ? "1" : "0";
    expandBtn.textContent = autoExpand ? "↕ Stack" : "⇔ Side by side";
    if (autoExpand) { slots.classList.add("multi-col"); resize(colCount); }
    expandBtn.addEventListener("click", () => {
      const isExpanded = expandBtn.dataset.expanded === "1";
      const cols = parseInt(expandBtn.dataset.colCount) || 2;
      expandBtn.dataset.expanded = isExpanded ? "0" : "1";
      slots.classList.toggle("multi-col", !isExpanded);
      resize(!isExpanded ? cols : 1);
      expandBtn.textContent = !isExpanded ? "↕ Stack" : "⇔ Side by side";
    });
    slots.before(expandBtn);
  } else if (window.POPUP_SOURCE === "desktop" && typeof btcAPI !== "undefined" &&
             typeof btcAPI.resizePopup === "function") {
    btcAPI.resizePopup(1);
  }
}

function _setClarifyStep(area, step) {
  const steps = area.querySelector(".clarify-steps");
  if (!steps) return;
  steps.querySelectorAll(".clarify-step").forEach((el, i) => {
    const n = i + 1;
    el.className = "clarify-step" + (n < step ? " done" : n === step ? " active" : "");
    const dot = el.querySelector(".clarify-step-dot");
    if (dot) dot.textContent = n < step ? "✓" : String(n);
  });
}

function showClarify(clarifyText, originalText, systemPrompt, meta) {
  // meta = { actionVal, round, initialText, usedProvider, usedModel }
  const round     = meta?.round || 1;
  const MAX_ROUNDS = 3;

  document.getElementById("result-loading").style.display = "none";
  document.getElementById("result-slots").innerHTML = "";
  const area = document.getElementById("clarify-area");
  const qEl  = document.getElementById("clarify-questions");
  if (!area || !qEl) { showResult([clarifyText], null); return; }

  // Build step indicator once, reuse across rounds
  let stepsEl = area.querySelector(".clarify-steps");
  if (!stepsEl) {
    stepsEl = document.createElement("div");
    stepsEl.className = "clarify-steps";
    const mkStep = (n, label) => {
      const s   = document.createElement("div"); s.className = "clarify-step";
      const dot = document.createElement("div"); dot.className = "clarify-step-dot"; dot.textContent = String(n);
      const lbl = document.createElement("span"); lbl.textContent = label;
      s.appendChild(dot); s.appendChild(lbl); return s;
    };
    const mkLine = () => { const l = document.createElement("div"); l.className = "clarify-step-line"; return l; };
    stepsEl.appendChild(mkStep(1, "Analyze"));
    stepsEl.appendChild(mkLine());
    stepsEl.appendChild(mkStep(2, "Questions"));
    stepsEl.appendChild(mkLine());
    stepsEl.appendChild(mkStep(3, "Generate"));
    area.insertBefore(stepsEl, area.firstChild);
  }
  _setClarifyStep(area, 2);

  // Update header — mention round number on follow-ups
  const header = area.querySelector(".clarify-header");
  if (header) {
    header.textContent = round === 1
      ? "A couple of quick questions to nail this:"
      : `A few more details needed (round ${round} of ${MAX_ROUNDS}):`;
  }

  const lines = clarifyText.replace(/^CLARIFY:\n?/i, "").split("\n")
    .map(l => l.replace(/^[•\-*\d.]+\s*/, "").trim()).filter(Boolean);
  qEl.innerHTML = "";
  lines.forEach(q => {
    const p = document.createElement("p"); p.className = "clarify-question"; p.textContent = q;
    qEl.appendChild(p);
  });
  const answersEl = document.getElementById("clarify-answers");
  answersEl.value = "";
  area.querySelector(".clarify-error")?.remove();
  area.style.display = "block";
  setTimeout(() => answersEl.focus(), 50);

  const btn = document.getElementById("clarify-submit-btn");
  if (!btn) return;
  const handler = async () => {
    const answers = answersEl.value.trim();
    if (!answers) {
      let errEl = area.querySelector(".clarify-error");
      if (!errEl) {
        errEl = document.createElement("p");
        errEl.className = "clarify-error";
        errEl.style.cssText = "color:var(--red,#f38ba8);font-size:12px;margin:4px 0 0";
        btn.before(errEl);
      }
      errEl.textContent = "Please type your answers before continuing.";
      return;
    }
    btn.removeEventListener("click", handler);
    _setClarifyStep(area, 3);
    area.style.display = "none";
    showLoading(true, 1);
    const lt = document.getElementById("result-loading-text");
    if (lt) lt.textContent = round < MAX_ROUNDS ? "Re-analyzing with your answers…" : "Generating your prompt…";

    // Accumulate all context so each round builds on the last
    const combinedText = `${originalText}\n\n---\nContext (round ${round}):\n${answers}`;
    try {
      const r = await callAIWithFallback(
        _settings.configuredProviders, _settings.geminiModels, _settings,
        systemPrompt, combinedText
      );

      // If AI still needs more info and rounds remain, loop back to questions
      if (round < MAX_ROUNDS && /^clarify:/i.test(r.result.trimStart())) {
        showClarify(r.result, combinedText, systemPrompt,
          { ...meta, round: round + 1, usedProvider: r.usedProvider, usedModel: r.usedModel });
        return;
      }

      // Final result
      showResult([r.result], null);

      // Save to history — runProcess returns early on clarify so we save here
      if (meta?.actionVal) {
        try {
          await window.appSet({ lastAction: meta.actionVal });
          const today       = todayDate();
          const stored      = await window.appGet(["historyFull", "historyLog"]);
          const historyFull = stored.historyFull || [];
          const historyLog  = purgeOldLog(stored.historyLog || []);
          const inputSnap   = meta.initialText || originalText;
          const cost        = estimateCost(r.usedModel || "", inputSnap, [r.result]);
          historyFull.push({
            id: uid(), timestamp: Date.now(), date: today,
            source: window.POPUP_SOURCE || "desktop",
            action: meta.actionVal, provider: r.usedProvider || "", model: r.usedModel || "",
            systemPrompt: systemPrompt.slice(0, 2000),
            inputText: inputSnap.slice(0, 5000),
            outputs: [r.result.slice(0, 5000)],
            clarifyRounds: round,
            ...cost
          });
          historyLog.push({
            timestamp: Date.now(), date: today,
            source: window.POPUP_SOURCE || "desktop",
            action: meta.actionVal, provider: r.usedProvider || "", model: r.usedModel || "",
            inputLen: inputSnap.length, outputLen: r.result.length
          });
          await window.appSet({ historyFull: historyFull.slice(-500), historyLog: historyLog.slice(-200) });
          if (typeof window.onRunComplete === "function") window.onRunComplete();
        } catch { /* non-fatal */ }
      }
    } catch (err) {
      showResult(null, err.message);
    } finally {
      document.getElementById(window.RUN_BTN_ID || "run-btn").disabled = false;
    }
  };
  btn.addEventListener("click", handler);
}

// Returns true when historyPin is set — callers should suppress history display.
async function isHistoryPinLocked() {
  try {
    const stored = await window.appGet(["historyPin"]);
    return !!stored.historyPin;
  } catch {
    return false;
  }
}

async function runProcess() {
  const inputEl = document.getElementById("input-text");
  const text    = inputEl
    ? inputEl.value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim()
    : "";
  if (!text) { if (inputEl) inputEl.focus(); return; }
  const hasProviders = Array.isArray(_settings.configuredProviders) && _settings.configuredProviders.length > 0;
  const hasLegacy    = _settings.openaiKey || _settings.claudeKey || _settings.geminiKey;
  if (!hasProviders && !hasLegacy) {
    document.getElementById("result-area").style.display = "block";
    showResult(null, "No AI provider configured. Open Settings → add a Gemini API key to get started (free).");
    return;
  }
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
  const grammarBlock = buildGrammarInstructions(_settings.grammarFilters);
  if (grammarBlock) systemPrompt += "\n\n" + grammarBlock;
  const contextSheet   = document.getElementById("context-sheet");
  const contextOpen    = contextSheet?.style.display !== "none";
  const audienceValue  = contextOpen ? (document.getElementById("context-audience-select")?.value || "") : "";
  const audiencePrompt = contextOpen ? buildAudiencePrompt() : "";
  if (audiencePrompt) systemPrompt += `\n\nAudience: ${audiencePrompt}`;
  await window.appSet({ lastContextAudience: audienceValue });
  const isPro  = isProUnlocked(_settings);
  const count  = actionVal === "fix-spelling" || actionVal === "clarity-check" || !isPro
    ? 1
    : Math.max(1, Math.min(4, parseInt(document.getElementById("variants-select")?.value) || 1));
  const runBtnId = window.RUN_BTN_ID || "run-btn";
  document.getElementById(runBtnId).disabled = true;
  showLoading(true, count);
  if (isClarifyEnabled) {
    const lt = document.getElementById("result-loading-text");
    if (lt) lt.textContent = "Analyzing your idea…";
  }
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
    if (isClarifyEnabled && results.length === 1 && /^clarify:/i.test(results[0].trimStart())) {
      showClarify(results[0], text, systemPrompt,
        { actionVal, round: 1, initialText: text, usedProvider, usedModel });
      return;
    }
    showResult(results, null);
    await window.appSet({ lastAction: actionVal });
    const today       = todayDate();
    const stored      = await window.appGet(["historyFull", "historyLog"]);
    const historyFull = stored.historyFull || [];
    const historyLog  = purgeOldLog(stored.historyLog || []);
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
    historyLog.push({
      timestamp: Date.now(), date: today,
      source: window.POPUP_SOURCE || "desktop",
      action: actionVal, provider: usedProvider, model: usedModel,
      inputLen: text.length, outputLen: results.reduce((s, r) => s + r.length, 0)
    });
    await window.appSet({ historyFull: historyFull.slice(-500), historyLog: historyLog.slice(-200) });
    if (typeof window.onRunComplete === "function") window.onRunComplete();
  } catch (err) {
    showResult(null, err.message);
  } finally {
    document.getElementById(window.RUN_BTN_ID || "run-btn").disabled = false;
  }
}
