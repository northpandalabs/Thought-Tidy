// content.js — DOM wiring only
// wordCount, wordDiff, esc are globals from lib/text.js (loaded first by manifest)

let savedRange = null;
let modal = null;

document.addEventListener("contextmenu", () => {
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && sel.toString().trim()) {
    savedRange = sel.getRangeAt(0).cloneRange();
  } else {
    savedRange = null;
  }
});

browser.runtime.onMessage.addListener((msg) => {
  if (msg.action === "show-loading") showModal(msg.originalText, null, true);
  if (msg.action === "show-results") showModal(msg.originalText, msg.results, false);
  if (msg.action === "show-error")   showError(msg.error);
});

function showModal(originalText, results, loading) {
  removeModal();

  const overlay = document.createElement("div");
  overlay.id = "aie-overlay";

  const origWords = wordCount(originalText); // from lib/text.js

  overlay.innerHTML = `
    <div id="aie-modal">
      <div id="aie-header">
        <span>✦ BrainFix AI</span>
        <button id="aie-close" title="Close (Esc)">✕</button>
      </div>
      <div id="aie-body">
        <div class="aie-section">
          <div class="aie-label">Original <span class="aie-wordcount">${origWords} words</span></div>
          <div class="aie-box aie-original">${esc(originalText)}</div>
        </div>
        ${loading ? `<div class="aie-loading"><div class="aie-spinner"></div> Processing…</div>` : ""}
        ${results ? results.map((r, i) => `
          <div class="aie-section">
            <div class="aie-label">
              ${results.length > 1 ? `Suggestion ${i + 1}` : "Suggested"}
              <span class="aie-wordcount">${wordDiff(originalText, r)}</span>
            </div>
            <div class="aie-box aie-result">${esc(r)}</div>
            <div class="aie-actions">
              <button class="aie-btn aie-copy" data-idx="${i}">Copy</button>
              <button class="aie-btn aie-replace" data-idx="${i}">Replace Selected</button>
            </div>
          </div>`).join("") : ""}
      </div>
    </div>`;

  document.body.appendChild(overlay);
  modal = overlay;
  overlay._results = results || [];

  overlay.querySelector("#aie-close").addEventListener("click", removeModal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) removeModal(); });
  document.addEventListener("keydown", handleEsc);

  overlay.querySelectorAll(".aie-copy").forEach(btn => {
    btn.addEventListener("click", () => {
      const text = overlay._results[+btn.dataset.idx];
      navigator.clipboard.writeText(text).catch(() => {});
      btn.textContent = "Copied!";
      setTimeout(() => (btn.textContent = "Copy"), 1600);
    });
  });

  overlay.querySelectorAll(".aie-replace").forEach(btn => {
    btn.addEventListener("click", () => {
      replaceSelection(overlay._results[+btn.dataset.idx]);
      removeModal();
    });
  });
}

function showError(msg) {
  if (!modal) return;
  const body = modal.querySelector("#aie-body");
  body.querySelector(".aie-loading")?.remove();
  const div = document.createElement("div");
  div.className = "aie-error";
  div.textContent = msg;
  body.appendChild(div);
}

function replaceSelection(newText) {
  if (!savedRange) return;
  try {
    savedRange.deleteContents();
    savedRange.insertNode(document.createTextNode(newText));
  } catch (_) {}
  savedRange = null;
}

function handleEsc(e) { if (e.key === "Escape") removeModal(); }

function removeModal() {
  if (modal) { modal.remove(); modal = null; }
  document.removeEventListener("keydown", handleEsc);
}
