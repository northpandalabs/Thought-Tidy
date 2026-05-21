# ✦ BrainFix AI

**A Firefox extension for people who are great at getting ideas out — but not at spelling them.**

Built for ADHD brains, fast thinkers, and anyone who knows exactly what they mean but struggles to make it look that way on screen. Highlight any text, right-click, and let the AI clean it up. No subscriptions. No accounts. No one reading your writing. Just your API key and a model that does what you tell it.

> Built by **[BHeck](https://github.com/BHeck)**. Open source, MIT licensed. Fork it, improve it, make it yours.  
> If this helped you — ⭐ **[star the repo](https://github.com/BHeck/AI-Enhancer)** and share it. That's all I ask.

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
|---|---|
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
|---|---|---|
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

No BrainFix servers. No analytics. No accounts. Your text goes from your browser to the AI provider you chose and nowhere else. The extension is 10 files of plain HTML/CSS/JS.

---

## Install (Firefox)

1. Download or clone this repo
2. Open Firefox → go to `about:debugging`
3. Click **This Firefox** → **Load Temporary Add-on…**
4. Select `manifest.json` from the folder
5. Click the **✦** toolbar button → **Open Full Settings**
6. Paste your API key → models load automatically → click **Save Settings**

**To make it permanent** (survives Firefox restarts): submit to [addons.mozilla.org](https://addons.mozilla.org) or self-sign with [web-ext](https://github.com/mozilla/web-ext).

Chrome support: the manifest needs minor changes for MV3 — PRs welcome.

---

## Get an API key

You need a key from **one** of these. All have free tiers or cheap starting costs.

| Provider | Get your key | Cheapest model | Free tier |
|---|---|---|---|
| **OpenAI** | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | gpt-4o-mini (~$0.00015/1K tokens) | No, but cheap |
| **Anthropic (Claude)** | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) | claude-haiku-4-5 | No, but cheap |
| **Google Gemini** | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) | gemini-2.0-flash | **Yes** |

A typical "Fix Spelling" on a paragraph costs less than $0.001. You'd spend $1 on thousands of fixes.

---

## For developers

No bundler. No framework. No build step. Just clone and load.

```
manifest.json       ← extension config + permissions (Firefox MV2)
background.js       ← context menu registration + API calls + profile injection
content.js          ← result modal injected into pages
content.css         ← modal styling
popup/              ← toolbar button popup (quick provider/variant switch)
options/            ← full settings page (keys, models, profile, custom prompts)
```

**Things worth building:**
- Chrome / Edge support (MV3 manifest changes)
- Keyboard shortcut to trigger last-used action
- Writing history (last N fixes, restorable)
- More providers (Mistral, Cohere, local Ollama)
- Right-click on images → describe/alt-text generation
- A real MCP server integration for Claude Desktop users

PRs, issues, and forks are all welcome. This isn't a product — it's a starting point.

---

## Built by

**Bailey Heck (BHeck)** — [github.com/BHeck](https://github.com/BHeck)

I built this because I needed it. If you're forking or sharing it, keep the credit in the README. That's the deal.

---

## License

MIT — build whatever you want with it.
