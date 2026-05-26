# Privacy Policy — Blur-to-Clear

**Effective date:** 2026-05-25
**Last updated:** 2026-05-25
**Contact:** bheckservices@gmail.com

---

## Who we are

Blur-to-Clear is an AI writing assistant browser extension and desktop application developed and operated by Brandon Heck ("we", "us", "our"). The source code is available at https://github.com/Bheck890/Blur-to-Clear.

---

## The short version

**We do not collect, store, or transmit your personal data or your text to our servers — because we don't have any servers.**

Your text goes directly from your device to whichever AI provider you configured (OpenAI, Anthropic, Google, or local Ollama). We never see it.

---

## What data is involved and where it goes

### 1. Text you process

When you run an action (Fix Grammar, Make Professional, etc.), your text is sent **directly from your device** to the AI provider you have configured. It passes through no Blur-to-Clear server. We cannot see it, log it, or access it.

The AI provider you use (OpenAI, Anthropic, Google) receives your text and their own privacy policy governs that transmission. Ollama runs entirely on your own machine — no text leaves your device at all.

### 2. API keys

Your AI provider API keys are stored **locally on your device only**, encrypted:

- **Desktop app** — encrypted in your operating system's credential store (Windows Data Protection API / macOS Keychain / Linux Secret Service)
- **Browser extension** — encrypted with AES-256-GCM using a key stored in browser local storage

API keys are never transmitted to us, never leave your device except to authenticate with their respective AI provider (OpenAI, Anthropic, Google).

### 3. Pro license verification

When you activate a Pro license, we send your **email address and license key** to Gumroad's API (https://api.gumroad.com) solely to verify that the license is valid. This data is not stored on our servers. Gumroad's privacy policy (https://gumroad.com/privacy) governs how Gumroad handles this data.

After verification, the email address and license key are stored **locally on your device** to avoid re-verifying on every launch. They are never sent to us.

### 4. Usage history

Every action you run is logged locally — timestamp, action name, provider, model, input/output length, and estimated cost. This data is stored **on your device only** and never transmitted anywhere. You can clear it at any time from Settings.

### 5. Profile data

Your name, role, writing style, and personal context (if you fill in the Profile section) are stored **locally on your device only**. This data is included in prompts sent to your AI provider when you use profile-based actions; it is not sent to us.

### 6. Settings sync (extension + desktop)

When both the browser extension and the desktop app are running simultaneously, settings are synced over your computer's loopback network address (127.0.0.1:47391). This sync never leaves your machine. It is protected by a random per-session token.

---

## What we do NOT collect

- We do not collect analytics or usage statistics.
- We do not collect crash reports or error logs.
- We do not track which features you use.
- We do not set cookies.
- We do not use any third-party tracking or advertising SDKs.
- We do not have user accounts (free tier requires none).

---

## Third-party services

| Service | Purpose | Their privacy policy |
|---------|---------|---------------------|
| **OpenAI** | AI processing (if you configure it) | https://openai.com/privacy |
| **Anthropic** | AI processing (if you configure it) | https://www.anthropic.com/privacy |
| **Google** | AI processing (if you configure it) | https://policies.google.com/privacy |
| **Ollama** | Local AI processing — no data leaves your device | N/A |
| **Gumroad** | Payment processing and license verification | https://gumroad.com/privacy |
| **GitHub** | Source code hosting | https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement |

We are not responsible for the data practices of these third-party services. You should review their privacy policies before providing them with your data.

---

## Children's privacy

Blur-to-Clear is not directed at children under the age of 13 (or the applicable age of digital consent in your jurisdiction). We do not knowingly collect personal information from children.

---

## Your rights

Because we do not collect or store your personal data on any server, there is no data held by us to access, correct, or delete. All locally stored data can be removed by:

- **Extension:** Clearing the extension's storage via your browser's extension management page, or uninstalling the extension.
- **Desktop app:** Uninstalling the application removes all locally stored settings and history.

If you have questions about data held by Gumroad in relation to a purchase, contact Gumroad directly at https://gumroad.com/privacy.

---

## Data security

All sensitive data stored locally (API keys, license credentials) is encrypted. API keys use AES-256-GCM encryption on the extension and OS-level credential stores on the desktop. No sensitive data is stored in plaintext.

---

## Changes to this policy

We will update the effective date at the top of this document when changes are made. Material changes will be noted in the release notes. Continued use of Blur-to-Clear after a policy update constitutes acceptance of the updated policy.

---

## Contact

Questions about this privacy policy: bheckservices@gmail.com
