'use strict';
/* global browser, btcAPI, formatCost, verifyPin, hashPin */

let allEntries = [];
let devMode    = false;

async function load() {
  const data = await browser.storage.local.get(["historyFull", "devMode", "historyPin"]);
  if (data.historyPin) { showPinGate(data); return; }
  loadHistory(data);
  showSetPinBtn();
}

function showSetPinBtn() {
  const controls = document.querySelector(".header-controls");
  if (!controls || document.getElementById("set-pin-btn")) return;

  const btn = document.createElement("button");
  btn.id        = "set-pin-btn";
  btn.textContent = "🔒 Set Passcode";
  btn.style.cssText = "padding:5px 12px;border-radius:6px;background:#313244;color:#cdd6f4;border:none;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap";
  btn.addEventListener("mouseover", () => btn.style.background = "#45475a");
  btn.addEventListener("mouseout",  () => btn.style.background = "#313244");
  controls.insertBefore(btn, controls.firstChild);

  let formEl = null;
  btn.addEventListener("click", () => {
    if (formEl) { formEl.remove(); formEl = null; return; }
    formEl = document.createElement("div");
    formEl.style.cssText = "margin:12px auto;max-width:380px;background:#1e1e2e;border:1px solid #313244;border-radius:10px;padding:20px;display:flex;flex-direction:column;gap:10px";
    formEl.innerHTML = `
      <p style="font-weight:700;font-size:14px;color:#cdd6f4">Set History Passcode</p>
      <p style="font-size:12.5px;color:#a6adc8">Lock your history behind a passcode. You'll need to enter it each time you open the history page.</p>
      <input type="password" id="pin-set-new" placeholder="New passcode" autocomplete="new-password" style="padding:7px 10px;border-radius:6px;border:1px solid #313244;background:#181825;color:#cdd6f4;font-size:13px">
      <input type="password" id="pin-set-confirm" placeholder="Confirm passcode" autocomplete="new-password" style="padding:7px 10px;border-radius:6px;border:1px solid #313244;background:#181825;color:#cdd6f4;font-size:13px">
      <p id="pin-set-err" style="color:#f38ba8;font-size:12px;display:none"></p>
      <div style="display:flex;gap:8px">
        <button id="pin-set-save" style="padding:6px 18px;border-radius:6px;background:#89b4fa;color:#1e1e2e;border:none;font-weight:700;cursor:pointer;font-size:13px">Set Passcode</button>
        <button id="pin-set-cancel" style="padding:6px 14px;border-radius:6px;background:#313244;color:#cdd6f4;border:none;font-weight:600;cursor:pointer;font-size:13px">Cancel</button>
      </div>`;
    document.querySelector(".page-header").insertAdjacentElement("afterend", formEl);
    document.getElementById("pin-set-new").focus();
    document.getElementById("pin-set-cancel").addEventListener("click", () => { formEl.remove(); formEl = null; });
    document.getElementById("pin-set-save").addEventListener("click", async () => {
      const newP  = document.getElementById("pin-set-new").value;
      const conf  = document.getElementById("pin-set-confirm").value;
      const errEl = document.getElementById("pin-set-err");
      errEl.style.display = "none";
      if (!newP || !conf) { errEl.textContent = "Both fields are required."; errEl.style.display = ""; return; }
      if (newP !== conf)  { errEl.textContent = "Passcodes do not match.";   errEl.style.display = ""; return; }
      const hash = await hashPin(newP);
      await browser.storage.local.set({ historyPin: hash });
      formEl.remove(); formEl = null;
      btn.remove();
      showPinManagement(hash);
    });
  });
}

function showPinGate(data) {
  const page     = document.querySelector(".page");
  const header   = document.querySelector(".page-header");
  const statsBar = document.getElementById("stats-bar");
  if (header)   header.style.display   = "none";
  if (statsBar) statsBar.style.display = "none";

  const gate = document.createElement("div");
  gate.style.cssText = "display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;gap:14px";
  gate.innerHTML = `
    <div style="font-size:32px">🔒</div>
    <p style="font-weight:700;font-size:16px">History is locked</p>
    <p style="color:var(--text-muted,#a6adc8);font-size:13px">Enter your passcode to view your processing history.</p>
    <div style="display:flex;gap:8px;margin-top:4px">
      <input type="password" id="pin-gate-input" placeholder="Passcode" autocomplete="off" style="padding:7px 10px;border-radius:6px;border:1px solid var(--surface,#313244);background:var(--bg-card,#1e1e2e);color:var(--text,#cdd6f4);font-size:13px;width:180px">
      <button id="pin-gate-btn" style="padding:7px 18px;border-radius:6px;background:var(--accent,#89b4fa);color:#1e1e2e;border:none;font-weight:700;cursor:pointer;font-size:13px">Unlock</button>
    </div>
    <p id="pin-gate-err" style="color:#f38ba8;font-size:12px;display:none">Incorrect passcode.</p>
  `;
  page.prepend(gate);
  document.getElementById("pin-gate-input").addEventListener("keydown", e => { if (e.key === "Enter") document.getElementById("pin-gate-btn").click(); });
  document.getElementById("pin-gate-btn").addEventListener("click", async () => {
    const pin = document.getElementById("pin-gate-input").value;
    if (!pin) return;
    const ok = await verifyPin(pin, data.historyPin);
    if (!ok) { document.getElementById("pin-gate-err").style.display = ""; return; }
    gate.remove();
    if (header) header.style.display = "";
    const fresh = await browser.storage.local.get(["historyFull", "devMode", "historyPin"]);
    showPinManagement(fresh.historyPin || data.historyPin);
    loadHistory(fresh);
  });
}

function showPinManagement(initialHash) {
  let currentHash = initialHash;
  const statsBar = document.getElementById("stats-bar");

  const dropWrap = document.createElement("div");
  dropWrap.style.cssText = "position:relative;display:inline-block;margin-left:auto";

  const mainBtn = document.createElement("button");
  mainBtn.textContent = "🔒 Passcode active ▾";
  mainBtn.style.cssText = "padding:4px 10px;border-radius:6px;background:#313244;color:#cdd6f4;border:none;font-size:11.5px;font-weight:600;cursor:pointer;white-space:nowrap";

  const dropdown = document.createElement("div");
  dropdown.style.cssText = "position:absolute;top:calc(100% + 4px);right:0;left:auto;background:#1e1e2e;border:1px solid #313244;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.35);display:none;flex-direction:column;min-width:170px;overflow:hidden;z-index:100";

  const changeOpt = document.createElement("button");
  changeOpt.textContent = "Change Passcode";
  changeOpt.style.cssText = "padding:9px 14px;background:none;border:none;border-bottom:1px solid #313244;color:#cdd6f4;font-size:12.5px;font-weight:500;cursor:pointer;text-align:left;width:100%";

  const removeOpt = document.createElement("button");
  removeOpt.textContent = "Remove Passcode";
  removeOpt.style.cssText = "padding:9px 14px;background:none;border:none;color:#f38ba8;font-size:12.5px;font-weight:500;cursor:pointer;text-align:left;width:100%";

  [changeOpt, removeOpt].forEach(o => {
    o.addEventListener("mouseover", () => o.style.background = "#313244");
    o.addEventListener("mouseout",  () => o.style.background = "none");
  });

  dropdown.append(changeOpt, removeOpt);
  dropWrap.append(mainBtn, dropdown);
  statsBar.appendChild(dropWrap);

  mainBtn.addEventListener("click", e => {
    e.stopPropagation();
    dropdown.style.display = dropdown.style.display === "flex" ? "none" : "flex";
  });
  document.addEventListener("click", () => { dropdown.style.display = "none"; });

  let formEl = null;

  function clearForm() {
    if (formEl) { formEl.remove(); formEl = null; }
  }

  function showForm(html, onMounted) {
    if (formEl) { formEl.remove(); formEl = null; }
    dropdown.style.display = "none";
    formEl = document.createElement("div");
    formEl.style.cssText = "margin:12px auto;max-width:360px;background:#181825;border:1px solid #313244;border-radius:10px;padding:20px;display:flex;flex-direction:column;gap:10px";
    formEl.innerHTML = `${html}`;
    statsBar.insertAdjacentElement("afterend", formEl);
    onMounted();
  }

  changeOpt.addEventListener("click", () => {
    showForm(`
      <p style="font-weight:700;font-size:14px;color:#cdd6f4">Change Passcode</p>
      <input type="password" id="pin-current" placeholder="Current passcode" autocomplete="off" style="padding:7px 10px;border-radius:6px;border:1px solid #313244;background:#181825;color:#cdd6f4;font-size:13px">
      <input type="password" id="pin-new" placeholder="New passcode" autocomplete="new-password" style="padding:7px 10px;border-radius:6px;border:1px solid #313244;background:#181825;color:#cdd6f4;font-size:13px">
      <input type="password" id="pin-confirm" placeholder="Confirm new passcode" autocomplete="new-password" style="padding:7px 10px;border-radius:6px;border:1px solid #313244;background:#181825;color:#cdd6f4;font-size:13px">
      <p id="pin-change-err" style="color:#f38ba8;font-size:12px;display:none"></p>
      <div style="display:flex;gap:8px">
        <button id="pin-change-save" style="padding:6px 18px;border-radius:6px;background:#89b4fa;color:#1e1e2e;border:none;font-weight:700;cursor:pointer;font-size:13px">Save</button>
        <button id="pin-change-cancel" style="padding:6px 14px;border-radius:6px;background:#313244;color:#cdd6f4;border:none;font-weight:600;cursor:pointer;font-size:13px">Cancel</button>
      </div>
    `, () => {
      document.getElementById("pin-change-cancel").addEventListener("click", clearForm);
      document.getElementById("pin-change-save").addEventListener("click", async () => {
        const curr    = document.getElementById("pin-current").value;
        const newPin  = document.getElementById("pin-new").value;
        const confirm = document.getElementById("pin-confirm").value;
        const errEl   = document.getElementById("pin-change-err");
        errEl.style.display = "none";
        if (!curr || !newPin || !confirm) { errEl.textContent = "All fields are required."; errEl.style.display = ""; return; }
        if (newPin !== confirm) { errEl.textContent = "New passcodes do not match."; errEl.style.display = ""; return; }
        const ok = await verifyPin(curr, currentHash);
        if (!ok) { errEl.textContent = "Current passcode is incorrect."; errEl.style.display = ""; return; }
        const newHash = await hashPin(newPin);
        await browser.storage.local.set({ historyPin: newHash });
        currentHash = newHash;
        clearForm();
      });
      document.getElementById("pin-current").focus();
    });
  });

  removeOpt.addEventListener("click", () => {
    showForm(`
      <p style="font-weight:700;font-size:14px;color:#cdd6f4">Remove Passcode</p>
      <p style="font-size:12.5px;color:#a6adc8">Enter your current passcode to remove the lock from history.</p>
      <input type="password" id="pin-remove-current" placeholder="Current passcode" autocomplete="off" style="padding:7px 10px;border-radius:6px;border:1px solid #313244;background:#181825;color:#cdd6f4;font-size:13px">
      <p id="pin-remove-err" style="color:#f38ba8;font-size:12px;display:none">Incorrect passcode.</p>
      <div style="display:flex;gap:8px">
        <button id="pin-remove-confirm" style="padding:6px 18px;border-radius:6px;background:#f38ba8;color:#1e1e2e;border:none;font-weight:700;cursor:pointer;font-size:13px">Remove</button>
        <button id="pin-remove-cancel" style="padding:6px 14px;border-radius:6px;background:#313244;color:#cdd6f4;border:none;font-weight:600;cursor:pointer;font-size:13px">Cancel</button>
      </div>
    `, () => {
      document.getElementById("pin-remove-cancel").addEventListener("click", clearForm);
      document.getElementById("pin-remove-confirm").addEventListener("click", async () => {
        const curr  = document.getElementById("pin-remove-current").value;
        const errEl = document.getElementById("pin-remove-err");
        errEl.style.display = "none";
        if (!curr) return;
        const ok = await verifyPin(curr, currentHash);
        if (!ok) { errEl.style.display = ""; return; }
        await browser.storage.local.remove("historyPin");
        if (formEl) { formEl.remove(); formEl = null; }
        dropWrap.remove();
      });
      document.getElementById("pin-remove-current").focus();
    });
  });
}

function loadHistory(data) {
  allEntries = [...(data.historyFull || [])].reverse();
  devMode    = data.devMode || false;
  const badge = document.getElementById("dev-mode-badge");
  if (badge) badge.style.display = devMode ? "inline-block" : "none";
  render(allEntries);
}

function render(entries) {
  const list     = document.getElementById("history-list");
  const empty    = document.getElementById("empty-state");
  const statsBar = document.getElementById("stats-bar");
  list.innerHTML = "";

  if (!entries.length) {
    empty.style.display    = "block";
    statsBar.style.display = "none";
    return;
  }
  empty.style.display    = "none";
  statsBar.style.display = "flex";

  let totalIn = 0, totalOut = 0, totalCost = 0, hasCost = false;
  entries.forEach(e => {
    totalIn  += e.inputTokens  || 0;
    totalOut += e.outputTokens || 0;
    if (e.costUSD != null) { totalCost += e.costUSD; hasCost = true; }
  });
  document.getElementById("stats-count").textContent  = `${entries.length} request${entries.length !== 1 ? "s" : ""}`;
  document.getElementById("stats-tokens").textContent = `${(totalIn + totalOut).toLocaleString()} tokens`;
  document.getElementById("stats-cost").textContent   = hasCost ? `~${formatCost(totalCost)} est.` : "cost unknown";

  entries.forEach(e => list.appendChild(buildEntry(e)));
}

function buildEntry(e) {
  const el = document.createElement("div");
  el.className = "he";

  const t    = new Date(e.timestamp);
  const time = `${e.date || ""}\n${String(t.getHours()).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")}`;
  const actionLabel = (e.action || "").replace(/-/g, " ");
  const meta        = [e.provider, e.model].filter(Boolean).join(" · ");
  const costTxt     = e.costUSD != null ? `~${formatCost(e.costUSD)}` : "—";
  const inputPreview = (e.inputText || "").replace(/\n+/g, " ").slice(0, 120);

  const summary = document.createElement("div"); summary.className = "he-summary";
  [
    ["he-time",   time],
    ["he-action", actionLabel],
    ["he-meta",   meta],
    [`he-cost${e.costUSD == null ? " unknown" : ""}`, costTxt],
  ].forEach(([cls, txt]) => {
    const sp = document.createElement("span"); sp.className = cls; sp.textContent = txt;
    summary.appendChild(sp);
  });
  const preview = document.createElement("div"); preview.className = "he-preview";
  preview.textContent = inputPreview + (inputPreview.length < (e.inputText || "").length ? "…" : "");
  el.append(summary, preview);

  function expand() {
    el.classList.add("expanded");
    preview.style.display = "none";

    const body = document.createElement("div");
    body.className = "he-body";

    // System prompt — developer mode only
    if (devMode && e.systemPrompt) {
      const spLabel = document.createElement("div");
      spLabel.className = "he-section-label he-prompt-label"; spLabel.textContent = "Prompt sent to AI";
      const spBox = document.createElement("div");
      spBox.className = "he-text-box he-prompt-box"; spBox.textContent = e.systemPrompt;
      body.append(spLabel, spBox);
    }

    const inLabel = document.createElement("div");
    inLabel.className = "he-section-label"; inLabel.textContent = "Input text";
    const inBox = document.createElement("div");
    inBox.className = "he-text-box"; inBox.textContent = e.inputText || "(no text saved)";
    body.append(inLabel, inBox);

    const outputs = e.outputs || (e.outputText ? [e.outputText] : []);
    outputs.forEach((out, i) => {
      const outLabel = document.createElement("div");
      outLabel.className = "he-output-label";
      outLabel.textContent = outputs.length > 1 ? `Output ${i + 1} of ${outputs.length}` : "Output";
      const outBox = document.createElement("div");
      outBox.className = "he-output-box"; outBox.textContent = out || "(empty)";
      body.append(outLabel, outBox);
    });

    const tokenRow = document.createElement("div");
    tokenRow.className = "he-token-row";
    tokenRow.innerHTML = `
      In: <span>${(e.inputTokens || 0).toLocaleString()} tok</span>
      Out: <span>${(e.outputTokens || 0).toLocaleString()} tok</span>
      Est. cost: <span>${e.costUSD != null ? formatCost(e.costUSD) : "unknown model"}</span>`;
    body.appendChild(tokenRow);

    const actRow = document.createElement("div");
    actRow.className = "he-actions-row";
    if (outputs.length > 0) {
      const copyBtn = document.createElement("button");
      copyBtn.className = "he-copy-btn";
      copyBtn.textContent = outputs.length > 1 ? "Copy Output 1" : "Copy Output";
      copyBtn.addEventListener("click", async () => {
        await btcAPI.writeClipboard(outputs[0]);
        copyBtn.textContent = "Copied!";
        setTimeout(() => (copyBtn.textContent = outputs.length > 1 ? "Copy Output 1" : "Copy Output"), 1600);
      });
      actRow.appendChild(copyBtn);
    }

    const collapseBtn = document.createElement("button");
    collapseBtn.className = "he-collapse-btn";
    collapseBtn.textContent = "▲ Collapse";
    collapseBtn.addEventListener("click", collapse);
    actRow.appendChild(collapseBtn);
    body.appendChild(actRow);

    el.appendChild(body);
    summary.removeEventListener("click", expand);
  }

  function collapse() {
    const body = el.querySelector(".he-body");
    if (body) body.remove();
    el.classList.remove("expanded");
    preview.style.display = "";
    summary.addEventListener("click", expand);
  }

  summary.addEventListener("click", expand);
  return el;
}

// ── Search ────────────────────────────────────────────────────

document.getElementById("search-input").addEventListener("input", (e) => {
  const q = e.target.value.trim().toLowerCase();
  if (!q) { render(allEntries); return; }
  render(allEntries.filter(entry =>
    (entry.action      || "").toLowerCase().includes(q) ||
    (entry.inputText   || "").toLowerCase().includes(q) ||
    (entry.systemPrompt|| "").toLowerCase().includes(q) ||
    (entry.provider    || "").toLowerCase().includes(q) ||
    (entry.model       || "").toLowerCase().includes(q) ||
    (entry.outputs     || []).some(o => o.toLowerCase().includes(q))
  ));
});

// ── Clear all ─────────────────────────────────────────────────

document.getElementById("clear-all-btn").addEventListener("click", async () => {
  if (!confirm(`Delete all ${allEntries.length} history entries? This cannot be undone.`)) return;
  await browser.storage.local.set({ historyFull: [] });
  allEntries = [];
  render([]);
});

load();
