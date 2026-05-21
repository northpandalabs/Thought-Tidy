// background.js — event wiring only (MV3 service worker)
importScripts("browser-polyfill.js", "lib/prompts.js", "lib/api.js");

const DYN_SEP = "dyn-sep";
const DYN_MAX = 8;
const dynId   = (i) => `dyn-${i}`;

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
  browser.contextMenus.create({ id: "ai-root",       title: "BrainFix AI",                    contexts: ["selection"] });
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
});

browser.runtime.onStartup.addListener(rebuildCustomMenu);
browser.storage.onChanged.addListener((changes) => {
  if (changes.customPrompts) rebuildCustomMenu();
});

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.selectionText) return;

  const selectedText = info.selectionText.trim();
  const menuId = info.menuItemId;

  const settings = await browser.storage.local.get([
    "provider", "openaiKey", "claudeKey", "geminiKey",
    "openaiModel", "claudeModel", "geminiModel",
    "variants", "customPrompts",
    "profileName", "profileRole", "profileStyle", "profileContext", "profileEnabled"
  ]);

  const provider = settings.provider || "openai";
  const variants  = menuId === "fix-spelling" ? 1 : Math.max(1, Math.min(4, parseInt(settings.variants) || 1));

  let systemPrompt;
  if (menuId.startsWith("dyn-")) {
    const idx = parseInt(menuId.replace("dyn-", ""), 10);
    const cp  = (settings.customPrompts || [])[idx];
    systemPrompt = cp?.prompt || "Process the following text:";
  } else {
    systemPrompt = MENU_PROMPTS[menuId]; // from lib/prompts.js
    if (!systemPrompt) return;
  }

  systemPrompt = buildPromptWithProfile(systemPrompt, settings); // from lib/prompts.js

  browser.tabs.sendMessage(tab.id, { action: "show-loading", originalText: selectedText });

  try {
    const results = [];
    for (let i = 0; i < variants; i++) {
      results.push(await callAI(provider, settings, systemPrompt, selectedText)); // from lib/api.js
    }
    browser.tabs.sendMessage(tab.id, { action: "show-results", originalText: selectedText, results });
  } catch (err) {
    browser.tabs.sendMessage(tab.id, { action: "show-error", error: err.message });
  }
});
