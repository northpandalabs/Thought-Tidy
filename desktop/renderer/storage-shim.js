// storage-shim.js — makes window.btcAPI look like browser.storage.local + browser.runtime
// Load this BEFORE any script that calls browser.storage.local or browser.runtime.
// This lets the extension JS files (popup.js, options.js) run unmodified in Electron.

/* global btcAPI */

const browser = {
  storage: {
    local: {
      async get(keys) {
        const result = await btcAPI.getSettings(keys);
        // IPC handler returns raw value for a string key; wrap to match WebExtension API
        if (typeof keys === "string") return { [keys]: result };
        return result;
      },
      set(data) { return btcAPI.setSettings(data); },
      remove(keys) { return btcAPI.deleteSettings(keys); }
    }
  },
  runtime: {
    openOptionsPage() { return btcAPI.openSettings(); }
  }
};
