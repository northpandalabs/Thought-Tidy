// background.js — Blur-to-Clear event wiring (MV3 service worker)
importScripts("browser-polyfill.js", "lib/build-flags.js", "lib/text.js", "lib/prompts.js", "lib/pricing.js", "lib/api.js", "lib/updater.js");

const DYN_SEP = "dyn-sep";
const DYN_MAX = 8;
const dynId   = (i) => `dyn-${i}`;

// ── Update alarm ───────────────────────────────────────────────────────────────

function scheduleUpdateAlarm() {
  const noon = new Date();
  noon.setHours(12, 0, 0, 0);
  if (noon.getTime() <= Date.now()) noon.setDate(noon.getDate() + 1);
  browser.alarms.create('btc-update-check', { when: noon.getTime(), periodInMinutes: 1440 });
}

browser.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'btc-update-check') checkAndStoreUpdate();
});

async function rebuildCustomMenu() {
  const toRemove = [DYN_SEP, ...Array.from({ length: DYN_MAX }, (_, i) => dynId(i))];
  await Promise.all(toRemove.map(id => browser.contextMenus.remove(id).catch(() => {})));

  const { customPrompts = [] } = await browser.storage.local.get("customPrompts");
  if (!customPrompts.length) return;

  await browser.contextMenus.create({
    id: DYN_SEP, parentId: "ai-root", type: "separator", contexts: ["selection"]
  });
  for (let i = 0; i < Math.min(customPrompts.length, DYN_MAX); i++) {
    await browser.contextMenus.create({
      id: dynId(i), parentId: "ai-root",
      title: `⚡ ${customPrompts[i].name}`,
      contexts: ["selection"]
    });
  }
}

browser.runtime.onInstalled.addListener(async () => {
  browser.contextMenus.create({ id: "ai-root", title: "Blur-to-Clear", contexts: ["selection"] });
  browser.contextMenus.create({ id: "see-history", title: "📋  See History", contexts: ["all"] });

  // TEST ONLY label — top of submenu, only in test builds
  if (typeof BUILD_FLAGS !== 'undefined' && BUILD_FLAGS.testBuild) {
    browser.contextMenus.create({
      id: "test-only-label", parentId: "ai-root",
      title: "── TEST ONLY ──", enabled: false, contexts: ["selection"]
    });
  }

  browser.contextMenus.create({ id: "sound-like-me", parentId: "ai-root", title: "👤  Sound Like Me",             contexts: ["selection"] });
  browser.contextMenus.create({ id: "fix-spelling",  parentId: "ai-root", title: "✓   Fix Spelling & Grammar",   contexts: ["selection"] });
  browser.contextMenus.create({ id: "professional",  parentId: "ai-root", title: "★   Make Professional",        contexts: ["selection"] });
  browser.contextMenus.create({ id: "sound-human",   parentId: "ai-root", title: "💬  Sound Human",              contexts: ["selection"] });
  browser.contextMenus.create({ id: "brain-dump",    parentId: "ai-root", title: "🧠  Brain Dump → Clear Text",  contexts: ["selection"] });
  browser.contextMenus.create({ id: "sep1",          parentId: "ai-root", type: "separator",                     contexts: ["selection"] });
  browser.contextMenus.create({ id: "improve",       parentId: "ai-root", title: "↑   Improve Writing",          contexts: ["selection"] });
  browser.contextMenus.create({ id: "formal",        parentId: "ai-root", title: "    Make Formal",              contexts: ["selection"] });
  browser.contextMenus.create({ id: "casual",        parentId: "ai-root", title: "    Make Casual",              contexts: ["selection"] });
  browser.contextMenus.create({ id: "shorten",       parentId: "ai-root", title: "    Shorten",                  contexts: ["selection"] });
  browser.contextMenus.create({ id: "expand",        parentId: "ai-root", title: "    Expand",                   contexts: ["selection"] });
  await rebuildCustomMenu();
  scheduleUpdateAlarm();
});

browser.runtime.onStartup.addListener(() => {
  rebuildCustomMenu();
  scheduleUpdateAlarm();
});
browser.storage.onChanged.addListener((changes) => {
  if (changes.customPrompts) rebuildCustomMenu();
});

const PROVIDER_STORAGE_KEYS = [
  "configuredProviders", "geminiModels",
  // legacy keys kept for migration shim in callAIWithFallback
  "provider", "openaiKey", "claudeKey", "geminiKey",
  "openaiModel", "claudeModel", "geminiModel"
];

// ── Run from popup (Process Selected Text button) ────────────────────────────
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== "run-from-popup") return;
  (async () => {
    const { tabId, actionVal, selectedText } = msg;
    const settings = await browser.storage.local.get([
      ...PROVIDER_STORAGE_KEYS,
      "customPrompts",
      "profileName", "profileRole", "profileStyle", "profileContext", "profileEnabled"
    ]);

    let systemPrompt;
    if (actionVal.startsWith("custom-")) {
      const idx = parseInt(actionVal.replace("custom-", ""), 10);
      systemPrompt = (settings.customPrompts || [])[idx]?.prompt || "Process the following text:";
    } else {
      systemPrompt = MENU_PROMPTS[actionVal];
      if (!systemPrompt) return;
    }
    systemPrompt = buildPromptWithProfile(systemPrompt, settings);

    browser.tabs.sendMessage(tabId, { action: "show-loading", originalText: selectedText });
    try {
      const { result, usedProvider, usedModel } = await callAIWithFallback(
        settings.configuredProviders, settings.geminiModels, settings, systemPrompt, selectedText
      );
      browser.tabs.sendMessage(tabId, { action: "show-results", originalText: selectedText, results: [result] });

      const today = todayDate();

      const { historyLog: hl = [] } = await browser.storage.local.get("historyLog");
      const fresh = purgeOldLog(hl);
      fresh.push({
        timestamp: Date.now(), date: today, source: "extension",
        action: actionVal, provider: usedProvider, model: usedModel,
        inputLen: selectedText.length, outputLen: result.length
      });
      await browser.storage.local.set({ historyLog: fresh.slice(-200), lastAction: actionVal });

      const { historyFull = [] } = await browser.storage.local.get("historyFull");
      const cost = estimateCost(usedModel, selectedText, [result]);
      historyFull.push({
        id: uid(), timestamp: Date.now(), date: today, source: "extension",
        action: actionVal, provider: usedProvider, model: usedModel,
        inputText: selectedText.slice(0, 5000),
        outputs: [result.slice(0, 5000)],
        ...cost
      });
      await browser.storage.local.set({ historyFull: historyFull.slice(-500) });
    } catch (err) {
      browser.tabs.sendMessage(tabId, { action: "show-error", error: err.message });
    }
  })();
  return true;
});

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "see-history") {
    browser.tabs.create({ url: browser.runtime.getURL("history/history.html") });
    return;
  }

  if (!info.selectionText) return;

  const selectedText = info.selectionText.trim();
  const menuId       = info.menuItemId;

  const settings = await browser.storage.local.get([
    ...PROVIDER_STORAGE_KEYS,
    "variants", "customPrompts",
    "profileName", "profileRole", "profileStyle", "profileContext", "profileEnabled"
  ]);

  const variants = menuId === "fix-spelling" ? 1 : Math.max(1, Math.min(4, parseInt(settings.variants) || 1));

  let systemPrompt;
  if (menuId.startsWith("dyn-")) {
    const idx = parseInt(menuId.replace("dyn-", ""), 10);
    const cp  = (settings.customPrompts || [])[idx];
    systemPrompt = cp?.prompt || "Process the following text:";
  } else {
    systemPrompt = MENU_PROMPTS[menuId];
    if (!systemPrompt) return;
  }
  systemPrompt = buildPromptWithProfile(systemPrompt, settings);

  browser.tabs.sendMessage(tab.id, { action: "show-loading", originalText: selectedText });

  try {
    const results = [];
    let usedProvider = "", usedModel = "";
    for (let i = 0; i < variants; i++) {
      const r = await callAIWithFallback(
        settings.configuredProviders, settings.geminiModels, settings, systemPrompt, selectedText
      );
      results.push(r.result);
      usedProvider = r.usedProvider;
      usedModel    = r.usedModel;
    }
    browser.tabs.sendMessage(tab.id, { action: "show-results", originalText: selectedText, results });

    const lastAction = menuId.startsWith("dyn-") ? menuId.replace("dyn-", "custom-") : menuId;
    await browser.storage.local.set({ lastAction });

    const today = todayDate();

    const { historyLog = [] } = await browser.storage.local.get("historyLog");
    const fresh = purgeOldLog(historyLog);
    fresh.push({
      timestamp: Date.now(), date: today, source: "extension",
      action: lastAction, provider: usedProvider, model: usedModel,
      inputLen: selectedText.length,
      outputLen: results.reduce((s, r) => s + r.length, 0)
    });
    await browser.storage.local.set({ historyLog: fresh.slice(-200) });

    const { historyFull = [] } = await browser.storage.local.get("historyFull");
    const cost = estimateCost(usedModel, selectedText, results);
    historyFull.push({
      id: uid(), timestamp: Date.now(), date: today, source: "extension",
      action: lastAction, provider: usedProvider, model: usedModel,
      inputText: selectedText.slice(0, 5000),
      outputs: results.map(r => r.slice(0, 5000)),
      ...cost
    });
    await browser.storage.local.set({ historyFull: historyFull.slice(-500) });
  } catch (err) {
    browser.tabs.sendMessage(tab.id, { action: "show-error", error: err.message });
  }
});
