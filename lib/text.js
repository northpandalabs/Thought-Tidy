// Pure text utilities — no browser or Node dependencies

function wordCount(str) {
  return str.trim().split(/\s+/).filter(Boolean).length;
}

function wordDiff(orig, result) {
  const ow   = wordCount(orig);
  const rw   = wordCount(result);
  const diff = rw - ow;
  if (diff === 0) return `${rw} words`;
  return `${rw} words (${diff > 0 ? "+" : ""}${diff})`;
}

// Escape for safe DOM text injection (content.js modal)
function esc(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

// Escape for innerHTML attributes (options.js custom prompt list)
function escHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Short random ID for custom prompts
function uid() {
  return Math.random().toString(36).slice(2, 9);
}

// Returns today's date string in YYYY-MM-DD format (local time)
function todayDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Removes log entries that are not from today. Returns the filtered array.
function purgeOldLog(entries) {
  const today = todayDate();
  return (entries || []).filter(e => e.date === today);
}

if (typeof module !== "undefined") {
  module.exports = { wordCount, wordDiff, esc, escHtml, uid, todayDate, purgeOldLog };
}
