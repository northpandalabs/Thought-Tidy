// preload.js — context bridge between main process and renderer
// Exposes a safe, typed API so renderers never touch Node.js directly.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("btcAPI", {
  // Settings store
  getSettings:    (keys)     => ipcRenderer.invoke("store-get", keys),
  setSettings:    (data)     => ipcRenderer.invoke("store-set", data),
  deleteSettings: (keys)     => ipcRenderer.invoke("store-delete", keys),

  // Clipboard
  readClipboard:  ()         => ipcRenderer.invoke("read-clipboard"),
  writeClipboard: (text)     => ipcRenderer.invoke("write-clipboard", text),

  // Window management
  openSettings:   ()         => ipcRenderer.invoke("open-settings"),
  openHistory:    ()         => ipcRenderer.invoke("open-history"),
  openResults:    ()         => ipcRenderer.invoke("open-results"),
  closePopup:     ()         => ipcRenderer.invoke("close-popup"),

  // External links
  openURL:        (url)      => ipcRenderer.invoke("open-url", url),

  // App meta: { isTestBuild, updateAvailable }
  getAppConfig:   ()         => ipcRenderer.invoke("get-app-config"),

  // Startup / login item
  getLoginItemEnabled: ()      => ipcRenderer.invoke("get-login-item"),
  setLoginItemEnabled: (val)   => ipcRenderer.invoke("set-login-item", val),

  // Display zoom
  setZoom: (zoom) => ipcRenderer.invoke("set-zoom", zoom),

  // Event: main process signals the popup was just shown
  onPopupOpened:  (callback) => {
    ipcRenderer.on("popup-opened", () => callback());
  }
});
