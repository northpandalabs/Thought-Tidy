// storage-shim.js — makes window.btcAPI look like browser.storage.local + browser.runtime
// Load this BEFORE any script that calls browser.storage.local or browser.runtime.
// This lets the extension JS files (popup.js, options.js) run unmodified in Electron.

/* global btcAPI */

const browser = {
  storage: {
    local: {
      get(keys)  { return btcAPI.getSettings(keys); },
      set(data)  { return btcAPI.setSettings(data); }
    }
  },
  runtime: {
    openOptionsPage() { return btcAPI.openSettings(); }
  }
};
