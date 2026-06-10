'use strict';
/* global browser, estimateCost, formatCost, purgeOldLog */

let allEntries = [];
let devMode    = false;

async function load() {
  const data = await browser.storage.local.get(["historyFull", "devMode", "historyPin"]);
  if (data.historyPin) { showPinGate(data); return; }
  loadHistory(data);
}

function showPinGate(data) {
  const page = document.querySelector(".page");
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
    loadHistory(data);
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
  const list   = document.getElementById("history-list");
  const empty  = document.getElementById("empty-state");
  const statsBar = document.getElementById("stats-bar");
  list.innerHTML = "";

  if (!entries.length) {
    empty.style.display    = "block";
    statsBar.style.display = "none";
    return;
  }
  empty.style.display    = "none";
  statsBar.style.display = "flex";

  // Aggregate stats
  let totalIn = 0, totalOut = 0, totalCost = 0, hasCost = false;
  entries.forEach(e => {
    totalIn  += e.inputTokens  || 0;
    totalOut += e.outputTokens || 0;
    if (e.costUSD != null) { totalCost += e.costUSD; hasCost = true; }
  });
  document.getElementById("stats-count").textContent  = `${entries.length} request${entries.length !== 1 ? "s" : ""}`;
  document.getElementById("stats-tokens").textContent  = `${(totalIn + totalOut).toLocaleString()} tokens`;
  document.getElementById("stats-cost").textContent    = hasCost ? `~${formatCost(totalCost)} est.` : "cost unknown";

  entries.forEach(e => list.appendChild(buildEntry(e)));
}

function buildEntry(e) {
  const el = document.createElement("div");
  el.className = "he";

  const t    = new Date(e.timestamp);
  const time = `${e.date || ""}\n${String(t.getHours()).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")}`;
  const actionLabel = (e.action || "").replace(/-/g, " ");
  const meta  = [e.provider, e.model].filter(Boolean).join(" · ");
  const costTxt = e.costUSD != null ? `~${formatCost(e.costUSD)}` : "—";
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

    // System Prompt (developer mode only)
    if (devMode && e.systemPrompt) {
      const spLabel = document.createElement("div");
      spLabel.className = "he-section-label he-prompt-label"; spLabel.textContent = "Prompt sent to AI";
      const spBox = document.createElement("div");
      spBox.className = "he-text-box he-prompt-box"; spBox.textContent = e.systemPrompt;
      body.append(spLabel, spBox);
    }

    // Input
    const inLabel = document.createElement("div");
    inLabel.className = "he-section-label"; inLabel.textContent = "Input text";
    const inBox = document.createElement("div");
    inBox.className = "he-text-box"; inBox.textContent = e.inputText || "(no text saved)";
    body.append(inLabel, inBox);

    // Outputs
    const outputs = e.outputs || (e.outputText ? [e.outputText] : []);
    outputs.forEach((out, i) => {
      const outLabel = document.createElement("div");
      outLabel.className = "he-output-label";
      outLabel.textContent = outputs.length > 1 ? `Output ${i + 1} of ${outputs.length}` : "Output";
      const outBox = document.createElement("div");
      outBox.className = "he-output-box"; outBox.textContent = out || "(empty)";
      body.append(outLabel, outBox);
    });

    // Token / cost row
    const tokenRow = document.createElement("div");
    tokenRow.className = "he-token-row";
    [
      ["In:",       `${(e.inputTokens  || 0).toLocaleString()} tok`],
      ["Out:",      `${(e.outputTokens || 0).toLocaleString()} tok`],
      ["Est. cost:", e.costUSD != null ? formatCost(e.costUSD) : "unknown model"],
    ].forEach(([lbl, val]) => {
      tokenRow.appendChild(document.createTextNode(lbl + " "));
      const sp = document.createElement("span"); sp.textContent = val;
      tokenRow.appendChild(sp);
      tokenRow.appendChild(document.createTextNode("  "));
    });
    body.appendChild(tokenRow);

    // Actions row
    const actRow = document.createElement("div");
    actRow.className = "he-actions-row";
    const outputs2 = outputs;
    if (outputs2.length > 0) {
      const copyBtn = document.createElement("button");
      copyBtn.className = "he-copy-btn";
      copyBtn.textContent = outputs2.length > 1 ? "Copy Output 1" : "Copy Output";
      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(outputs2[0]).catch(() => {});
        copyBtn.textContent = "Copied!";
        setTimeout(() => (copyBtn.textContent = outputs2.length > 1 ? "Copy Output 1" : "Copy Output"), 1600);
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
