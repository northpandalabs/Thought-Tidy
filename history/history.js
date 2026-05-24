'use strict';
/* global browser, estimateCost, formatCost, purgeOldLog */

let allEntries = [];

async function load() {
  const { historyFull = [] } = await browser.storage.local.get("historyFull");
  allEntries = [...historyFull].reverse(); // newest first
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

  el.innerHTML = `
    <div class="he-summary">
      <span class="he-time">${time}</span>
      <span class="he-action">${actionLabel}</span>
      <span class="he-meta">${meta}</span>
      <span class="he-cost${e.costUSD == null ? " unknown" : ""}">${costTxt}</span>
    </div>
    <div class="he-preview">${inputPreview}${inputPreview.length < (e.inputText || "").length ? "…" : ""}</div>`;

  const summary = el.querySelector(".he-summary");
  const preview = el.querySelector(".he-preview");

  function expand() {
    el.classList.add("expanded");
    preview.style.display = "none";

    const body = document.createElement("div");
    body.className = "he-body";

    // Input
    const inLabel = document.createElement("div");
    inLabel.className = "he-section-label"; inLabel.textContent = "Input";
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
    tokenRow.innerHTML = `
      In: <span>${(e.inputTokens || 0).toLocaleString()} tok</span>
      Out: <span>${(e.outputTokens || 0).toLocaleString()} tok</span>
      Est. cost: <span>${e.costUSD != null ? formatCost(e.costUSD) : "unknown model"}</span>`;
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
    (entry.action   || "").toLowerCase().includes(q) ||
    (entry.inputText|| "").toLowerCase().includes(q) ||
    (entry.provider || "").toLowerCase().includes(q) ||
    (entry.model    || "").toLowerCase().includes(q) ||
    (entry.outputs  || []).some(o => o.toLowerCase().includes(q))
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
