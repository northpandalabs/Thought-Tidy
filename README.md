# ✦ BrainFix AI

**A Chrome & Firefox extension for people who are great at getting ideas out — but not at spelling them.**

Built for ADHD brains, fast thinkers, and anyone who knows exactly what they mean but struggles to make it look that way on screen. Highlight any text, right-click, and let the AI clean it up. No subscriptions. No accounts. No one reading your writing. Just your API key and a model that does what you tell it.

> Built by **[Bheck890](https://github.com/Bheck890)**. Open source, MIT licensed. Fork it, improve it, make it yours.  
> If this helped you — ⭐ **[star the repo](https://github.com/Bheck890/BrainFix-AI)** and share it. That's all I ask.

---

## Why this exists

Grammarly underlines your typos. That's useful. But it won't:

- Turn your scattered brain dump into a clear email
- Rewrite something in *your specific voice*
- Know that you work in roofing and write to homeowners who aren't technical
- Let you build your own custom actions
- Keep your writing completely private
- Cost you nothing per month

This does all of that. The gap isn't grammar checking — it's that no tool treats you as a *specific person* with a *specific voice* trying to communicate with *specific people*.

---

## What it does

Right-click any selected text on any webpage:

| Action | What it actually does |
| --- | --- |
| **👤 Sound Like Me** | Rewrites in *your* voice using your saved profile — not generic AI, not formal, just you but clear |
| **✓ Fix Spelling & Grammar** | Cleans up mistakes without changing anything else |
| **★ Make Professional** | Full grammar fix + ensures your full meaning comes through — sounds confident and articulate |
| **💬 Sound Human** | Takes stiff or AI-sounding text and makes it feel like a real person wrote it |
| **🧠 Brain Dump → Clear Text** | You vomit your thoughts, it organizes everything into clean readable text without losing a word |
| **↑ Improve Writing** | Better clarity and flow, keeps your voice |
| Make Formal / Casual | Shift the tone either direction |
| Shorten / Expand | Adjust the length |
| **⚡ Your Custom Prompts** | Build your own named actions — Email Reply, Slack Message, LinkedIn Post, anything |

---

## The "Sound Like Me" difference

This is the feature that makes it personal instead of generic.

In Settings, fill out your profile:

- **Your name** — Bailey
- **Your role** — roofing contractor, developer, student, whatever
- **Your writing style** — "I write casually. Short sentences. Say 'gonna'. Use em-dashes."
- **Personal context** — your company, who you write to, common topics, anything the AI should know

Enable "Inject into every prompt" and every action now knows who you are. The output stops being ChatGPT and starts being *you, cleaned up*.

You can even maintain your context as a plain text file on GitHub Gist or your own site and load it with one click — the lightweight equivalent of what [Model Context Protocol](https://modelcontextprotocol.io) does for AI tools.

---

## vs. Grammarly

They're not the same tool. Grammarly corrects as you type. This rewrites on demand.

| | Grammarly | BrainFix AI |
| --- | --- | --- |
| Corrects as you type | ✓ | — |
| Rewrites whole passages | limited | ✓ |
| Knows who YOU are | — | ✓ (Your Profile) |
| Brain dump → organized text | — | ✓ |
| Custom prompt actions | — | ✓ (up to 8, named) |
| Works on any webpage | ✓ | ✓ |
| Privacy | their servers | your provider only |
| Monthly cost | $12–15/mo | fractions of a cent per fix |
| Open source | — | ✓ MIT |
| Your data | stored by Grammarly | goes only to Claude/OpenAI/Gemini |

Use Grammarly for inline typo correction if you want it. Use this for everything else.

---

## How it works

1. You highlight text and right-click → pick an action
2. The extension sends your text + a system prompt directly to your chosen AI provider
3. A modal shows original vs. suggested text side by side (with word count)
4. Click **Replace Selected** or **Copy** — done

No BrainFix servers. No analytics. No accounts. Your text goes from your browser to the AI provider you chose and nowhere else. The extension is ~10 files of plain HTML/CSS/JS with a small build step to produce browser-specific packages.

---

## Install locally (for testing)

### Prerequisites

```bash
npm install        # installs webextension-polyfill
npm run build      # builds dist/chrome/ and dist/firefox/
```

Or build one target at a time:

```bash
npm run build:chrome
npm run build:firefox
```

### Chrome / Edge

1. Run `npm run build:chrome` — output lands in `dist/chrome/`
2. Open Chrome → go to `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked**
5. Select the `dist/chrome/` folder
6. Click the ✦ toolbar button → **Open Full Settings** → paste your API key → **Save**

### Firefox

1. Run `npm run build:firefox` — output lands in `dist/firefox/`
2. Open Firefox → go to `about:debugging`
3. Click **This Firefox** → **Load Temporary Add-on…**
4. Select any file inside the `dist/firefox/` folder (e.g. `manifest.json`)
5. Click the ✦ toolbar button → **Open Full Settings** → paste your API key → **Save**

> **Note:** Firefox temporary add-ons are removed when Firefox restarts. To make it permanent, either publish it to AMO or self-sign with [web-ext](https://github.com/mozilla/web-ext).

---

## Publish to extension stores

### Chrome Web Store

1. Run `npm run build:chrome`

2. Zip the `dist/chrome/` folder:

   ```bash
   # Windows PowerShell
   Compress-Archive -Path dist/chrome/* -DestinationPath brainfixai-chrome.zip

   # macOS / Linux
   cd dist/chrome && zip -r ../../brainfixai-chrome.zip . && cd ../..
   ```

3. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
4. Sign in with a Google account — one-time $5 developer registration fee
5. Click **New Item** → upload `brainfixai-chrome.zip`
6. Fill out the store listing (name, description, screenshots, category: **Productivity**)
7. Submit for review — Chrome reviews usually take 1–3 business days
8. Once approved, the extension goes live at your store URL

### Firefox Add-ons (AMO)

1. Run `npm run build:firefox`

2. Zip the `dist/firefox/` folder:

   ```bash
   # Windows PowerShell
   Compress-Archive -Path dist/firefox/* -DestinationPath brainfixai-firefox.zip

   # macOS / Linux
   cd dist/firefox && zip -r ../../brainfixai-firefox.zip . && cd ../..
   ```

3. Go to [addons.mozilla.org/developers](https://addons.mozilla.org/developers/) and sign in / create an account (free)
4. Click **Submit a New Add-on** → **On this site** → upload `brainfixai-firefox.zip`
5. Answer the source code question — since this is open source, link the GitHub repo
6. Fill out the listing (name, description, screenshots, category: **Writing**)
7. Submit for review — AMO reviews typically take a few days for new add-ons; faster after the first
8. Once approved, the add-on is live on AMO and installable with one click

### Versioning

Before uploading, bump the `version` field in both `package.json` and `manifest.json` to match (e.g. `"1.4.0"`). Both stores reject re-uploads of the same version number.

---

## Get an API key

You need a key from **one** of these. All have free tiers or cheap starting costs.

| Provider | Get your key | Cheapest model | Free tier |
| --- | --- | --- | --- |
| **OpenAI** | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | gpt-4o-mini (~$0.00015/1K tokens) | No, but cheap |
| **Anthropic (Claude)** | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) | claude-haiku-4-5 | No, but cheap |
| **Google Gemini** | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) | gemini-2.0-flash | **Yes** |

A typical "Fix Spelling" on a paragraph costs less than $0.001. You'd spend $1 on thousands of fixes.

---

## For developers

No bundler. No framework. Minimal build step (just copies files + swaps the manifest background section per browser).

```text
manifest.json         ← source manifest (MV3, service_worker — Chrome base)
background.js         ← context menu wiring + API dispatch (MV3 service worker)
content.js            ← result modal injected into pages
content.css           ← modal styling
lib/
  api.js              ← provider API calls (OpenAI, Anthropic, Gemini)
  models.js           ← model lists per provider
  prompts.js          ← system prompts + profile injection
  text.js             ← text utilities (shared with content script)
popup/                ← toolbar button popup (quick provider/variant switch)
options/              ← full settings page (keys, models, profile, custom prompts)
scripts/
  build.js            ← produces dist/chrome/ and dist/firefox/
  setup.js            ← first-run setup helper
tests/                ← Jest unit tests for lib/
dist/
  chrome/             ← built Chrome extension (load unpacked here)
  firefox/            ← built Firefox extension (load temporary add-on here)
```

**Build output differences (Chrome vs Firefox):**

| | Chrome (`dist/chrome/`) | Firefox (`dist/firefox/`) |
| --- | --- | --- |
| `background` in manifest | `"service_worker": "background.js"` | `"scripts": [...]` array |
| `importScripts()` in background.js | kept | stripped (deps in manifest instead) |
| `browser_specific_settings` | removed | `gecko.id` added |

**Things worth building:**

- Keyboard shortcut to trigger last-used action
- Writing history (last N fixes, restorable)
- More providers (Mistral, Cohere, local Ollama)
- Right-click on images → describe / alt-text generation
- A real MCP server integration for Claude Desktop users

PRs, issues, and forks are all welcome.

---

## FAQ

**Does BrainFix AI work on Chrome and Firefox?**  
Yes. Run `npm run build` to produce `dist/chrome/` (Manifest V3, service worker) and `dist/firefox/` (Manifest V3, background scripts array). Both are ready to load or submit to their respective stores.

**Why do I need my own API key?**  
Your writing is private. The extension talks directly from your browser to the AI provider (OpenAI, Anthropic, or Google). There are no BrainFix servers, no accounts, and nothing stored except your settings (locally, in browser storage).

**Which AI provider should I pick?**  
Google Gemini has a free tier — good starting point. OpenAI gpt-4o-mini and Anthropic claude-haiku are both very cheap and fast. Claude tends to preserve voice better; GPT tends to be slightly more grammatically conservative.

**How much does it cost to use?**  
Fractions of a cent per action. Fixing a paragraph of text costs roughly $0.0003–$0.001 depending on the model. Most users spend under $1/month with heavy use.

**Is my writing stored anywhere?**  
No. Text goes from your browser to the AI provider you chose (OpenAI/Anthropic/Google) and nowhere else. The extension has no backend. Your API key and settings are stored locally in your browser using the standard `browser.storage.local` API.

**I get "background.service_worker is currently disabled" in Firefox.**  
You're loading the Chrome build in Firefox. Use `npm run build:firefox` and load `dist/firefox/` instead. Firefox MV3 uses `background.scripts` rather than a service worker.

**Can I use this without publishing to a store?**  
Yes. Chrome: load `dist/chrome/` as an unpacked extension (stays loaded until you remove it). Firefox: load `dist/firefox/` as a temporary add-on (removed on browser restart — or self-sign with web-ext).

**How do I add my own actions?**  
Open the extension settings → scroll to **Custom Prompts** → add a name and a system prompt. Your custom actions appear in the right-click menu (up to 8). No code changes needed.

**What is "Sound Like Me"?**  
A profile system where you describe yourself — your name, role, writing style, and any context the AI should know. When enabled, every action uses your profile as context, so the output matches your voice instead of sounding like generic AI.

**Does it work on every website?**  
It injects into all pages (`<all_urls>` content script). It works anywhere you can select text and right-click. Some sites with aggressive CSP or sandboxed iframes may block the modal injection — the right-click menu still appears, but the result won't display inline.

**Can I contribute?**  
Yes — PRs, issues, and forks are welcome. The codebase is plain HTML/CSS/JS with no framework. Run `npm test` before submitting a PR.

---

## Built by

**Bailey Heck (Bheck890)** — [github.com/Bheck890](https://github.com/Bheck890)

I built this because I needed it. If you're forking or sharing it, keep the credit in the README. That's the deal.

---

## License

MIT — build whatever you want with it.
