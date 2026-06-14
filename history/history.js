'use strict';
/* global browser, HistoryUI */

let allEntries = [];
const copyFn = text => navigator.clipboard.writeText(text);

async function load() {
  const data  = await browser.storage.local.get(["historyFull", "devMode", "historyPin"]);
  const badge = document.getElementById("dev-mode-badge");
  if (badge) badge.style.display = data.devMode ? "inline-block" : "none";

  const onReady = fresh => {
    allEntries = [...(fresh.historyFull || [])].reverse();
    HistoryUI.render(allEntries, copyFn);
    HistoryUI.showSetPinBtn(hash => HistoryUI.showPinManagement(hash));
  };

  if (data.historyPin) {
    HistoryUI.showPinGate(data, onReady);
    return;
  }
  onReady(data);
}

document.getElementById("search-input").addEventListener("input", e => {
  const q = e.target.value.trim().toLowerCase();
  if (!q) { HistoryUI.render(allEntries, copyFn); return; }
  HistoryUI.render(allEntries.filter(entry =>
    (entry.action       || "").toLowerCase().includes(q) ||
    (entry.inputText    || "").toLowerCase().includes(q) ||
    (entry.systemPrompt || "").toLowerCase().includes(q) ||
    (entry.provider     || "").toLowerCase().includes(q) ||
    (entry.model        || "").toLowerCase().includes(q) ||
    (entry.outputs      || []).some(o => o.toLowerCase().includes(q))
  ), copyFn);
});

document.getElementById("clear-all-btn").addEventListener("click", async () => {
  if (!confirm(`Delete all ${allEntries.length} history entries? This cannot be undone.`)) return;
  await browser.storage.local.set({ historyFull: [] });
  allEntries = [];
  HistoryUI.render([], copyFn);
});

load();
