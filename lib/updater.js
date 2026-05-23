// Extension update checker — compares installed version against GitHub Releases.
// Loaded via importScripts in background.js; all functions become globals.

const BTC_RELEASES_URL = 'https://api.github.com/repos/BHeck/BrainFix-AI/releases/latest';
const BTC_RELEASES_PAGE = 'https://github.com/BHeck/BrainFix-AI/releases/latest';

async function checkAndStoreUpdate() {
  try {
    const res = await fetch(BTC_RELEASES_URL, {
      headers: { 'Accept': 'application/vnd.github+json' }
    });
    if (!res.ok) return;
    const { tag_name, html_url } = await res.json();
    if (!tag_name) return;
    const latest  = tag_name.replace(/^v/, '');
    const current = browser.runtime.getManifest().version;
    if (btcSemverGt(latest, current)) {
      await browser.storage.local.set({
        updateAvailable: { version: latest, url: html_url || BTC_RELEASES_PAGE }
      });
    } else {
      await browser.storage.local.remove('updateAvailable');
    }
  } catch (_) { /* silent — update check must never crash the background */ }
}

function btcSemverGt(a, b) {
  const p = v => v.split('.').map(Number);
  const [aM, am, ap = 0] = p(a);
  const [bM, bm, bp = 0] = p(b);
  return aM !== bM ? aM > bM : am !== bm ? am > bm : ap > bp;
}
