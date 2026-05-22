# Blur-to-Clear — TODO

Tasks marked ✅ are shipped. Tasks marked 🔲 are planned.

---

## Bugs

- ✅ `Replace Selected` did not work on `<input>` / `<textarea>` elements — fixed by saving `activeElement` on contextmenu and using `selectionStart`/`selectionEnd` for form fields
- ✅ Firefox: `background.service_worker` error — build now outputs `background.scripts` array for Firefox
- ✅ Firefox: `data_collection_permissions` missing — added `required: ["none"]` to gecko block
- ✅ Firefox: `innerHTML` security warnings — `showModal` and `renderCustomPrompts` rewritten with DOM methods

---

## In progress

- 🔲 Setup wizard: first-run flow that walks through API key entry, tests the key on Enter, and saves — partially scaffolded in options.js

---

## UI / UX

- ✅ Popup: add text area so users can paste text and trigger actions without right-clicking
- ✅ Options: Restore/Revert button to discard unsaved form changes
- ✅ Options: Edit button per provider to unlock key field + warning before re-testing
- ✅ Options: Setup wizard shown on first load when no keys are saved
- ✅ Model dropdowns: cost tier badge (`$` / `$$` / `$$$`) next to each model name

---

## Features to build

- 🔲 Keyboard shortcut to trigger last-used action on selected text
- 🔲 Writing history: store last N results, restorable from the popup
- 🔲 More providers: Mistral, Cohere, local Ollama (requires `localhost` host permission)
- 🔲 Image right-click: describe image / generate alt text
- 🔲 MCP server integration for Claude Desktop users
- 🔲 "Sound Like Me" profile sync via GitHub Gist URL (load-on-open option)
- 🔲 Per-action variant count (fix spelling always 1, others user-configurable per action)
- 🔲 Notification when replacement is made (brief toast instead of just silent replace)

---

## Publishing / distribution

- ✅ Chrome Web Store build: `npm run build:chrome` → `dist/chrome/`
- ✅ Firefox AMO build: `npm run build:firefox` → `dist/firefox/`
- ✅ GitHub Actions CI: tests + builds both targets on every push/PR
- ✅ GitHub Actions release: zips + attaches to GitHub Release on version tag
- 🔲 Edge Add-ons: submit Chrome build (Edge accepts Chrome packages)
- 🔲 Auto-update version bump script (`npm run version 1.x.x` patches manifest + package.json together)

---

## Code quality

- ✅ All user-controlled text uses `textContent` / DOM methods — no unsafe `innerHTML`
- 🔲 Unit tests for `replaceSelection` edge cases
- 🔲 Unit tests for cost tier mapping
- 🔲 E2E smoke test: load extension in headless Chrome via puppeteer, right-click a field, assert modal appears

---

## Docs

- ✅ README: install locally (Chrome + Firefox), publish to stores, FAQ, GitHub links
- ✅ docs/desktop-app.md: plan for standalone Electron / Node app version
- 🔲 CONTRIBUTING.md: how to add a provider, how to add a built-in action
