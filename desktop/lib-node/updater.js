// Passive GitHub Releases version check — never auto-downloads or auto-installs.
// Checks once at the next noon (local time), then every 24 hours.
// Writes { version, url } to electron-store key 'updateAvailable' when a newer
// stable release is found; deletes the key when already up to date.

const https = require('https');
const { app } = require('electron');

const RELEASES_URL  = 'https://api.github.com/repos/BHeck/BrainFix-AI/releases/latest';
const RELEASES_PAGE = 'https://github.com/BHeck/BrainFix-AI/releases/latest';

function fetchLatestRelease() {
  return new Promise((resolve, reject) => {
    const req = https.get(RELEASES_URL, {
      headers: { 'User-Agent': 'thought-tidy-updater', 'Accept': 'application/vnd.github+json' }
    }, res => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { reject(new Error('Invalid GitHub API response')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10_000, () => { req.destroy(); reject(new Error('Update check timed out')); });
  });
}

function semverGt(a, b) {
  // Strip build metadata (+hash) and prerelease (-tag) before numeric comparison
  const parse = v => v.replace(/^v/, '').split('+')[0].split('-')[0].split('.').map(Number);
  const [aM, am, ap = 0] = parse(a);
  const [bM, bm, bp = 0] = parse(b);
  return aM !== bM ? aM > bM : am !== bm ? am > bm : ap > bp;
}

function msUntilNextNoon() {
  const now  = new Date();
  const noon = new Date(now);
  noon.setHours(12, 0, 0, 0);
  if (noon <= now) noon.setDate(noon.getDate() + 1);
  return noon - now;
}

function scheduleUpdateCheck(store) {
  async function check() {
    try {
      const { tag_name, html_url } = await fetchLatestRelease();
      if (!tag_name) return;
      const current = app.getVersion();
      if (semverGt(tag_name, current)) {
        store.set('updateAvailable', {
          version: tag_name.replace(/^v/, ''),
          url: html_url || RELEASES_PAGE
        });
      } else {
        store.delete('updateAvailable');
      }
    } catch (_) { /* silent — update check must never crash the app */ }
  }

  setTimeout(() => {
    check();
    setInterval(check, 24 * 60 * 60 * 1000);
  }, msUntilNextNoon());
}

module.exports = { scheduleUpdateCheck };
