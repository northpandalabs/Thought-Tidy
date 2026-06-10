// Bootstrap browser.storage.local for every context this page can load in:
//   Firefox extension  — native browser global, nothing to do
//   Chrome extension   — no browser, but chrome.storage.local exists
//   Electron desktop   — no browser, but btcAPI is exposed by preload
if (typeof browser === "undefined") {
  if (typeof btcAPI !== "undefined") {
    window.browser = { storage: { local: {
      async get(keys) {
        const r = await btcAPI.getSettings(keys);
        return typeof keys === "string" ? { [keys]: r } : r;
      },
      set:    d => btcAPI.setSettings(d),
      remove: k => btcAPI.deleteSettings(k)
    }}};
  } else if (typeof chrome !== "undefined" && chrome.storage) {
    window.browser = { storage: { local: {
      get:    k => new Promise(res => chrome.storage.local.get(k, res)),
      set:    d => new Promise(res => chrome.storage.local.set(d, res)),
      remove: k => new Promise(res => chrome.storage.local.remove(k, res))
    }}};
  }
}

async function init() {
  const { expandedResults } = await browser.storage.local.get("expandedResults");
  const container = document.getElementById("results-container");
  const countEl   = document.getElementById("top-count");

  const { themeMode } = await browser.storage.local.get("themeMode");
  document.documentElement.setAttribute("data-theme", themeMode || "dark");

  if (!expandedResults?.results?.length) {
    container.textContent = "No results found. Close this tab and run again.";
    return;
  }

  const results = expandedResults.results;
  countEl.textContent = `${results.length} suggestions`;
  container.className = "results-grid";
  container.innerHTML = "";

  results.forEach((text, i) => {
    const card = document.createElement("div");
    card.className = "result-card";

    const header = document.createElement("div");
    header.className = "card-header";
    const label = document.createElement("span");
    label.className   = "card-label";
    label.textContent = `Suggestion ${i + 1} of ${results.length}`;
    header.appendChild(label);
    card.appendChild(header);

    const body = document.createElement("div");
    body.className       = "card-body";
    body.contentEditable = "true";
    body.spellcheck      = false;
    body.textContent     = text;
    card.appendChild(body);

    const actions = document.createElement("div");
    actions.className = "card-actions";

    const copyBtn = document.createElement("button");
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", () => {
      const txt = body.innerText || body.textContent || "";
      if (typeof btcAPI !== "undefined") { btcAPI.writeClipboard(txt); }
      else { navigator.clipboard.writeText(txt).catch(() => {}); }
      copyBtn.textContent = "Copied!";
      copyBtn.classList.add("btn-copy-done");
      setTimeout(() => { copyBtn.textContent = "Copy"; copyBtn.classList.remove("btn-copy-done"); }, 1600);
    });
    actions.appendChild(copyBtn);

    card.appendChild(actions);
    container.appendChild(card);
  });
}

init().catch(err => {
  const c = document.getElementById("results-container");
  if (c) c.textContent = "Error loading results: " + (err?.message || err);
});
