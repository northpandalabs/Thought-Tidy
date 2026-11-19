# Third-party account-linking gateways, BYOK brokers and "user-pays" platforms (as of 2026-11-18)

Scope: options that let an end user set up AI accounts once in a central place and let Thought Tidy (MV3 extension + Electron, vanilla JS, direct browser/renderer calls, source-available with paid Pro features and a paid hosted subscription) use them without the user pasting raw provider keys. Unless marked "secondary", findings come from the vendor's own docs/pages fetched on 2026-11-18.

## 1. OpenRouter: OAuth PKCE, BYOK, fees, spend limits, subscription linking

### Takeaway
OpenRouter remains the most mature consumer "connect your account" broker: a PKCE flow (no client registration) returns a user-owned, user-billed API key with optional pre-filled credit limit and expiry. Users can attach their own OpenAI/Anthropic keys (BYOK) at the account level; as of mid-2026 BYOK is free up to $25,000/month of list-price inference on pay-as-you-go plans, then 5%. There is no ChatGPT/Claude subscription linking.

### Cited Findings
- Flow: redirect user to `https://openrouter.ai/auth` with `callback_url`, `code_challenge`, `code_challenge_method=S256`; exchange via `POST https://openrouter.ai/api/v1/auth/keys` with `code`, `code_verifier`, `code_challenge_method`; response contains `key`. PKCE is mandatory ("The `code_challenge` and `code_challenge_method` parameters are required") -- [OpenRouter OAuth docs](https://openrouter.ai/docs/guides/overview/auth/oauth)
- The issued key is "tied to their account"; "Their requests are billed to their own OpenRouter credits"; described as "a user-controlled API key" -- [OpenRouter OAuth docs](https://openrouter.ai/docs/guides/overview/auth/oauth)
- Optional params: `key_label`, `workspace_id`, `required_workspace_id`, `limit` (prefilled USD credit limit, positive, < 1,000,000, max 2 decimals, user can change), `expiration` (`1-hour`, `1-day`, `7-days`, `30-days`, `90-days`, `180-days`, `1-year`, `never`; user can change), `state` (CSRF; not returned on denial or headless). "The defaults are no credit limit and no expiry." -- [OpenRouter OAuth docs](https://openrouter.ai/docs/guides/overview/auth/oauth)
- Callbacks: "Localhost callbacks are supported on any port" (localhost apps get a `localhost:PORT` title and no marketplace/rankings attribution); use `https://` for hosted apps. Headless mode: omit `callback_url` and the code is displayed for the user to paste; single use, expires in 10 minutes. `chrome-extension://` callbacks are not mentioned. -- [OpenRouter OAuth docs](https://openrouter.ai/docs/guides/overview/auth/oauth)
- Storage guidance: "Store the key encrypted server-side or in the OS keychain. Do not persist it in browser storage or JavaScript-readable cookies." Verifier should be kept in `sessionStorage` or server session, never in a URL. Auth codes expire after 10 minutes. -- [OpenRouter OAuth docs](https://openrouter.ai/docs/guides/overview/auth/oauth)
- BYOK providers named: OpenAI, Anthropic, Azure (AI Foundry, Azure OpenAI), AWS Bedrock, Google Vertex AI, Fireworks (not a complete list). Fee: "5% of what the same model/provider would cost normally on OpenRouter", deducted from OpenRouter credits. Allowance is plan-dependent, measured by list-price cost: pay-as-you-go "includes $25,000 per month"; Enterprise custom. -- [OpenRouter BYOK docs](https://openrouter.ai/docs/guides/overview/auth/byok)
- BYOK routing: "prioritized" keys tried before OpenRouter endpoints; "fallback" keys after; per-key setting to allow/forbid shared-capacity fallback. "If no filters are set, the key is available to all models, API keys, and members." -- [OpenRouter BYOK docs](https://openrouter.ai/docs/guides/overview/auth/byok)
- Plans: Free (no BYOK, 25+ free models, 50 req/day); Standard PAYG: 5.5% fee on credit purchases, BYOK "$25,000/month of list-price inference with no fees, then 5%"; Business PAYG: 8% credit fee, same BYOK terms, EU/US in-region routing; Enterprise: custom. "OpenRouter's fee is charged when you buy credits ... never on individual requests." -- [OpenRouter pricing](https://openrouter.ai/pricing)
- History: Oct 1, 2025 offer was "1,000,000 BYOK requests per month for free", then 5%; an August 2026 update note says "BYOK pricing has since changed to a plan-dependent allowance measured by list-price inference cost." -- [OpenRouter announcement (older, 2025)](https://openrouter.ai/blog/announcements/1-million-free-byok-requests-per-month/)
- Secondary: the switch to a dollar cap is dated to ~July 14, 2026 by pricing trackers; a third-party article claims OpenRouter said the 5% BYOK fee "will be removed in the future and replaced with a fixed monthly subscription" (unconfirmed on OpenRouter's own pages) -- [usagepricing.com](https://www.usagepricing.com/blueprint/activity/openrouter-2026-07-14-byok-dollar-cap); [TrueFoundry blog](https://www.truefoundry.com/blog/openrouter-byok-explained-cheaper-often-faster-and-changing)
- Secondary: OpenRouter reportedly announced on Aug 19, 2026 that it is joining Stripe, pricing unchanged -- reported in search-result summaries only; not verified on a primary page.
- No evidence of "Sign in with ChatGPT" or any ChatGPT/Claude subscription linking in OpenRouter; pricing page describes no subscription-linked features; OpenRouter is not in OpenAI's SIWC partner lists seen -- [OpenRouter pricing](https://openrouter.ai/pricing); [IT Brief (secondary)](https://itbrief.co.uk/story/openai-launches-chatgpt-sign-in-for-16-partner-tools)

### Inferences
- Because BYOK provider keys are configured at account level and (absent filters) are "available to all ... API keys", an OAuth-issued key is just another key on the user's account and should route through the user's BYOK OpenAI/Anthropic keys. This makes OpenRouter a working "attach your own OpenAI/Anthropic billing once, use in many apps" broker today. Not explicitly documented for OAuth keys -- verify with a test account.
- For a light user (Thought Tidy usage), the $25k/month BYOK allowance means BYOK through OpenRouter is effectively fee-free; the only OpenRouter fee is 5.5% on any credits they buy (and a positive credit balance may be needed for the 5% overflow).
- OpenRouter's "do not persist in browser storage" guidance conflicts with how an MV3 extension typically stores keys (`browser.storage.local`). Mitigations: request short `expiration` and a `limit`, and/or store via Electron `safeStorage` on desktop.
- Thought Tidy already has this flow, so OpenRouter is the baseline against which other options should be compared.

### Gaps
- Whether `chrome-extension://` / `https://<id>.chromiumapp.org/` callbacks are officially supported is not stated in the docs (Thought Tidy's existing integration presumably works empirically).
- Whether OAuth-issued keys can be scoped to exclude BYOK, and whether BYOK requests need a positive credit balance, are not documented.
- The exact Stripe acquisition status and the "BYOK subscription replacement" plan could not be confirmed from primary sources.

## 2. Puter.js "user-pays" model

### Takeaway
Puter.js lets an app call 500+ models (incl. OpenAI and Anthropic) with no developer API key; each end user signs into a Puter account (popup) and pays Puter from their own allowance/balance. It is not BYOK -- users cannot attach their own OpenAI/Anthropic keys or subscriptions -- and its CDN-script delivery model clashes with MV3's ban on remotely hosted code.

### Cited Findings
- "Each user pays for the resources they consume in your app through their own Puter account"; developers pay nothing; "No API keys at all"; new users get a free monthly allowance, then are prompted to upgrade -- [Puter docs: User-Pays Model](https://docs.puter.com/user-pays-model/)
- Pricing page: "Puter doesn't charge developers for infrastructure"; users "pay Puter directly for the extra usage through their own account"; "Overages paid to Puter, not to you"; no per-unit rates, no free-allowance figure, no SLA stated -- [Puter developer pricing](https://developer.puter.com/pricing/)
- `puter.ai.chat()`: "More than 500 models are available"; providers include Anthropic, Azure OpenAI, Google, Meta, Mistral, OpenRouter, xAI, Alibaba; default model `gpt-5.4-nano`; `stream: true` supported; automatic provider fallback unless `fallback: false`. Examples load `https://js.puter.com/v2/` -- [Puter docs: AI chat](https://docs.puter.com/AI/chat/)
- Auth: "Because signIn() opens a popup window, it must be called from a user action" -- [Puter docs: Auth](https://docs.puter.com/Auth/)
- Node: `getAuthToken()` opens a browser window for Puter login and returns a token passed to `init()`; Node quick start requires Node 24+ -- [Puter blog](https://developer.puter.com/blog/browser-based-auth-puter-js-node/); [Puter Node tutorial](https://developer.puter.com/tutorials/puter-js-node-js/)
- Monetization: Puter Incentive Program pays approved apps by usage (promotional page says no application needed), while the formal terms call it "invite-only"; participants are bound by Puter ToS and App Developer Agreement -- [Earn with Puter](https://developer.puter.com/earn-with-puter/); [Puter Incentive Program Terms](https://puter.com/incentive-program-terms)
- Chrome MV3: "extensions now need to bundle all code they are using inside the extension itself"; loading a `<script src="https://...">` from a CDN violates the remotely-hosted-code rule; fetching data/JSON is allowed -- [Chrome: Remote hosted code](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code)

### Inferences
- For the extension, Puter.js would have to be bundled locally (not loaded from js.puter.com); whether the bundled library's popup sign-in works from an extension origin is untested/undocumented. Electron renderer use is plausible (popup or Node `getAuthToken`) but also undocumented.
- Puter does not satisfy "bill the user's own OpenAI/Anthropic account or ChatGPT/Claude subscription"; it bills a separate Puter balance. It is closer to a white-label AI resale with zero dev cost.
- Puter's model of the developer earning via an incentive program could coexist with Thought Tidy's Pro features, but the ToS/App Developer Agreement were not reviewed (see gaps).
- Reliability: no SLA, status page only; multi-provider fallback is built in.

### Gaps
- Free monthly allowance amount, Puter's per-token prices vs provider list prices (markup), and rate limits were not stated on the pages fetched.
- Puter Terms of Service / App Developer Agreement text (e.g., restrictions on paid apps, source-available apps) not retrieved.
- No primary source on Puter.js in MV3 extensions or Electron renderers.

## 3. Pollinations.ai (BYOP) and "AI wallet" / "bring your own AI" standards

### Takeaway
Pollinations now has a real OAuth-style "Pollinations Pay / Bring Your Own Pollen" flow (authorization code + PKCE, device flow, per-key budget and model scoping, opt-in 25% developer markup) -- functionally the closest analogue to OpenRouter OAuth, but it bills a Pollinations "pollen" balance, not the user's own OpenAI/Anthropic accounts. No cross-vendor "AI wallet" / window.ai-successor standard has gained traction as of Nov 2026.

### Cited Findings
- BYOP flow: redirect to `https://enter.pollinations.ai/authorize` with `response_type=code`, `client_id` (`pk_...` app key), `redirect_uri`, `scope`, `state`, S256 `code_challenge`; exchange at `https://enter.pollinations.ai/api/oauth/token` with `code_verifier`. Code single-use, 10-minute expiry. Legacy fragment flow returns `#api_key=sk_...` without PKCE. Device flow: `/api/device/code` then poll `/api/device/token` every 5 s (expires 1800 s) -- [Pollinations BRING_YOUR_OWN_POLLEN.md](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md)
- Returned key: user-authorized `sk_...` as `access_token`, default 7-day lifetime (`expires_in: 604800`), configurable `expiry` in days; "There are no refresh tokens; re-run the flow when the key expires"; revocation immediate -- [BYOP doc](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md)
- Controls: `models` scoping (category or IDs, user can remove on consent screen); `budget` dollar cap default $5, link can prefill max $10, user can change or set unlimited; scopes `profile`, `usage`, `keys` (only device flow / localhost), `machines`; generation needs no scope -- [BYOP doc](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md)
- Redirects: with a `client_id`, `redirect_uri` "must exactly match a Redirect URI on the App Key, including the query string"; loopback `http://localhost` matches any port; extension/custom-scheme URIs not mentioned -- [BYOP doc](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md)
- Browser use: token exchange callable directly via `fetch` because PKCE replaces client secret; store token in memory or `sessionStorage`, never `localStorage`; drop-in `<polli-connect>` button stores key in `sessionStorage` -- [BYOP doc](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md)
- Developer earnings (opt-in per App Key): "users pay 25% over base rates" -- e.g., $1.00 base, user pays $1.25, developer gets $0.25; referral bonus $2 per referred user topping up > $2 -- [BYOP doc](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md)
- Key types: `pk_` app key "Can't authenticate requests"; `sk_` secret must never be exposed client-side; browser clients pass user-authorized key as `?key=` (realtime WS) -- [Pollinations README](https://github.com/pollinations/pollinations)
- Secondary: pollen priced at roughly $1 per pollen -- [tooldirectory.ai](https://tooldirectory.ai/tools/pollinations); not confirmed on primary pages.
- Model list not given in docs fetched; only example is `openai/gpt-5.4-nano`; check `/models` -- [BYOP doc](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md)
- window.ai (original): browser extension where "you set all your API keys in one place" and apps request permission to send prompts; appears dormant ("created 2 years ago" per a listing) -- [reactjsexample (secondary)](https://reactjsexample.com/window-ai-use-your-own-ai-models-on-the-web/); [sourcepulse: window.ai by alexanderatallah](https://www.sourcepulse.org/projects/1833757)
- Harbor: Firefox extension + whitepaper proposing a browser-level "Web Agent API" built on MCP so users "bring your own AI to any website"; self-described sketch, adoption unconfirmed -- [Harbor whitepaper](https://r.github.io/Harbor/whitepaper.pdf)
- Opera WebAI / Prompt API draft: not a W3C standard nor on Standards Track (secondary) -- [remio.ai (secondary)](https://www.remio.ai/post/opera-webai-brings-local-models-to-the-browser-with-a-proposed-standard-behind-i)
- "AI wallet" searches return crypto wallets with AI features (WalletChan, AlgoVoi, OpenWallet), not LLM-access wallets -- [AMO: OpenWallet](https://addons.mozilla.org/en-US/firefox/addon/openwallet/)

### Inferences
- Pollinations BYOP is architecturally drop-in for Thought Tidy (same PKCE pattern as OpenRouter, browser-callable token exchange, loopback works for Electron). The 25% opt-in markup is a built-in revenue path that could complement or replace part of the hosted subscription. Downsides: 7-day keys with no refresh (re-consent weekly unless `expiry` raised), default $5 budget, uncertain Claude/GPT-flagship availability, and no BYOK of the user's OpenAI/Anthropic keys.
- No neutral "AI wallet" standard exists that Thought Tidy could target in Nov 2026; window.ai's concept effectively lives on as OpenRouter OAuth (same founder per the sourcepulse listing).

### Gaps
- Pollinations text model catalog (whether Claude / GPT flagship models are available), exact pollen pricing and markup vs provider list price, CORS policy, ToS and uptime not confirmed from primary sources.
- Whether Pollinations accepts `https://<ext-id>.chromiumapp.org/` redirect URIs on App Keys is not documented.
- No primary source found for any Mozilla/Brave/Chrome "BYOAI" API that targets cloud provider accounts; Chrome's built-in (on-device) Prompt API was not researched here.

## 4. Developer-side gateways: Vercel AI Gateway, Cloudflare AI Gateway, Portkey, LiteLLM, Helicone, Requesty, Eden AI

### Takeaway
None of these offer an end-user OAuth "connect your OpenAI/Anthropic account" flow for consumer apps; all are developer/team-side. Their BYOK means the developer (or team) stores provider keys. Vercel's request-scoped BYOK is the only one that cleanly passes a per-user raw key per request, but the user would still need to hand over that raw key and the app still needs a Vercel gateway key.

### Cited Findings
- Vercel: BYOK credentials are "scoped to be available throughout your Vercel team"; BYOK is paid-tier; requires purchased AI Gateway credits and positive balance (else `402`); "no added markup" on tokens; with default "Fallback to Vercel Keys" on, failed BYOK requests retry on Vercel keys billed to your credits; turning fallback off costs "$0.20 per 1,000 BYOK requests" -- [Vercel BYOK docs (last updated 2026-09-22)](https://vercel.com/docs/ai-gateway/authentication-and-byok/byok)
- Vercel request-scoped BYOK: pass `providerOptions.gateway.byok.{anthropic|openai}: [{ apiKey }]` per request; still requires `AI_GATEWAY_API_KEY` or OIDC -- [Vercel BYOK docs](https://vercel.com/docs/ai-gateway/authentication-and-byok/byok)
- Vercel: "Eligible ChatGPT Pro and Business subscribers and Claude Max and Team subscribers can claim API credits in a linked provider organization. Use a key from that organization with BYOK" -- credits stay with OpenAI/Anthropic -- [Vercel BYOK docs](https://vercel.com/docs/ai-gateway/authentication-and-byok/byok); [Vercel ChatGPT credits walkthrough](https://vercel.com/i/chatgpt-api-credits-ai-gateway)
- Vercel: per-end-user analytics via `user` and `tags` provider options (attribution only, not credential linking) -- search summary of [Vercel AI Gateway auth/BYOK docs](https://vercel.com/docs/ai-gateway/authentication-and-byok)
- Cloudflare: BYOK keys stored in Cloudflare Secrets Store via dashboard/API; gateway substitutes stored key "only when the provider authorization header is absent"; clients still need `cf-aig-authorization`; aliases via `cf-aig-byok-alias`; no end-user connect flow mentioned -- [Cloudflare AI Gateway BYOK](https://developers.cloudflare.com/ai-gateway/configuration/bring-your-own-keys/)
- Portkey: virtual keys store provider credentials in a vault and map to random identifiers; user-specific API keys for per-user/team tracking; nothing on end-user OAuth -- [Portkey virtual keys docs](https://portkey.ai/docs/virtual_key_old/product/ai-gateway/virtual-keys)
- Secondary: a Truto integration page describes end users linking their own Portkey workspace and choosing a virtual key (method unclear) -- [Truto: Portkey](https://truto.one/integrations/detail/portkey/)
- LiteLLM: self-hosted proxy with virtual keys, spend tracking per key/user/team/end user -- [LiteLLM virtual keys](https://docs.litellm.ai/docs/proxy/virtual_keys)
- Requesty: BYOK keys added manually in dashboard; its OAuth support is for MCP gateway tool servers (admin or per-member account connections), not LLM provider keys -- [Requesty BYOK docs](https://docs.requesty.ai/features/bring-your-own-keys); [Requesty MCP user keys](https://docs.requesty.ai/features/mcp-user-keys.md)
- Helicone and Eden AI: no primary docs retrieved; one secondary comparison characterizes Helicone as observability-first -- [assistant-ui gateway integrations (secondary)](https://www.assistant-ui.com/docs/integrations/gateways.md)

### Inferences
- These gateways solve the developer's problem (routing, observability, keeping keys off clients), not the "user connects their account once" problem. Using any of them from a browser extension would require either shipping a gateway key in the client (leaks) or adding a Thought Tidy backend -- contrary to the current direct-call architecture.
- The Vercel subscription-credit grant is a notable 2026 development: ChatGPT Pro/Business and Claude Max/Team subscribers can get API credits in an org. Those users could create an API key from that org and use it via OpenRouter BYOK or Thought Tidy's existing BYOK -- but it is still a raw key, not OAuth.

### Gaps
- Helicone and Eden AI end-user / BYOK capabilities not verified from primary docs.
- Portkey's current (non-"virtual_key_old") docs and any end-user connect feature not checked.
- Vercel/Cloudflare CORS policy for direct browser calls not checked.

## 5. Linking a ChatGPT plan or Claude subscription for use in other apps (and ToS)

### Takeaway
OpenAI now officially supports this: "Sign in with ChatGPT" (SIWC) with optional "ChatGPT plan usage" lets Go/Plus/Pro/Business users let an app make Responses API calls billed against their plan, with per-app caps. It is OAuth + PKCE, but paid or hosted apps must go through an interest form, and the documented self-serve path is for open-source/locally hosted apps using a `127.0.0.1` loopback. Anthropic explicitly forbids third parties from offering claude.ai login/subscription limits unless pre-approved. No broker found re-exposes either subscription to other apps.

### Cited Findings
- SIWC expansion announced at OpenAI DevDay on Sept 29, 2026 (secondary); launch partners reported as 16 tools incl. Amp, Devin, Lovable, OpenClaw, Notion, Vercel -- [IT Brief UK (secondary)](https://itbrief.co.uk/story/openai-launches-chatgpt-sign-in-for-16-partner-tools); [ProPakistani (secondary)](https://propakistani.pk/2026/10/23/your-chatgpt-subscription-can-now-work-in-other-apps/)
- User-facing doc: "Signing in and using your plan are separate permissions"; usage draws on "Codex / ChatGPT work usage included in your plan"; eligible plans Go, Plus, Pro, Business; "Connecting an app does not add a new allowance, and the app may have its own fees"; per-app caps ("a cap, not a separate allowance"); Business admins enable per app under Tenant settings > External access; plan use does not grant access to conversations/memories -- [learn.chatgpt.com: Sign in with ChatGPT](https://learn.chatgpt.com/docs/sign-in-with-chatgpt)
- Developer access: "Sign in with ChatGPT is currently offered to a select group of commercial partners", with a waitlist/interest form -- [OpenAI: Request a client ID](https://developers.openai.com/siwc/request-client-id)
- Open-source token sharing: intended for open-source and locally hosted apps; "If you're interested in offering it in a paid or remotely hosted app, complete the interest form." Client IDs are dynamically registered per user ("bound to the authenticated user and the workspace") -- [OpenAI: Token sharing (open source)](https://developers.openai.com/siwc/token-sharing-open-source)
- OAuth: authorize `https://auth.openai.com/api/accounts/authorize` (system browser), token `https://auth.openai.com/api/accounts/oauth/token`; first-time `client_id=dynamic_agent_client` with `agent_name_hint`, `ext_agent_host_id`, then save returned `oaiapp_...`; "This direct flow needs neither a client secret nor a partner API key"; PKCE S256 + state + nonce; redirect only HTTP loopback `127.0.0.1` (e.g. `http://127.0.0.1:1455/auth/callback`), port may vary, "Do not substitute with `localhost`"; scopes `openid profile email` + `offline_access resource.invoke chatgpt.tokens.use.direct`, `resource=https://api.openai.com/v1`; rotating refresh tokens -- [OpenAI: SIWC sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- Inference: `POST https://api.openai.com/v1/responses` with `Authorization: Bearer <ACCESS_TOKEN>`; must set `"store": false` and `"stream": true`; do not use ChatGPT `backend-api`; models from `GET /v1/models` (examples `gpt-6.1-sol`, `gpt-6.2-sol`); usage-limit error `subscription_sharing_usage_limit_exceeded` -- [OpenAI: Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
- Preview limitations: must omit `temperature`, `top_p`, `max_output_tokens`, `metadata`, `user`, `previous_response_id` (HTTP), etc.; explicit system-role items rejected (use `instructions`); no image generation, file search, Code Interpreter, hosted MCP, audio -- [OpenAI: Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
- Anthropic: "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK. Use the API key authentication methods ... instead." -- [Claude Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)
- Anthropic timeline (secondary): server-side blocks on subscription OAuth tokens in third-party tools (Jan 9, 2026); docs clarification Feb 19, 2026 that such use violates terms; May 2026 emails restoring Agent SDK / `claude -p` use on a separate, non-rollover credit pool -- [The Register (Feb 2026)](https://www.theregister.com/2026/02/20/anthropic_clarifies_ban_third_party_claude_access); [The Register (May 2026)](https://www.theregister.com/ai-ml/2026/05/14/anthropic-tosses-agents-into-the-api-billing-pool/5240748). A 36kr claim of an Oct 2026 approval for third-party apps could not be verified and conflicts with the current SDK doc -- [36kr (unverified)](https://eu.36kr.com/en/p/4026370532790145)
- Claude Max/Team subscribers can claim API credits in a linked Anthropic org (usable as an API key) -- [Vercel BYOK docs](https://vercel.com/docs/ai-gateway/authentication-and-byok/byok)

### Inferences
- Thought Tidy has paid Pro features and a hosted subscription, so it most likely falls under "paid or remotely hosted" and must use the commercial interest form rather than self-serve open-source token sharing. Being source-available (not OSI open source) is probably not enough on its own; confirm with OpenAI.
- The documented redirect is `127.0.0.1` loopback only: workable in Electron (main process listener), not in an MV3 extension (cannot run a listener). The extension would need to delegate to the desktop app or wait for other redirect types.
- The Responses-only, `store:false`/`stream:true`, no-`temperature` constraints are compatible with rewrite/summarize use, but Thought Tidy's OpenAI client code would need a SIWC-specific path.
- Any third-party "broker" that captures a user's ChatGPT/Claude subscription tokens and re-exposes them to other apps would be outside both vendors' rules; none found. For Claude, the compliant route remains a user API key (possibly via OpenRouter BYOK).

### Gaps
- CORS on `api.openai.com` with SIWC tokens from browser JS; ChatGPT plan-usage limits per request; whether non-coding apps qualify; commercial partner terms (revenue, branding) -- not documented in pages fetched (the help.openai.com articles returned 403).
- Exact DevDay 2026 date and partner list only from secondary press.

## 6. Overall fit for Thought Tidy (comparison)

### Takeaway
Only OpenRouter (today) delivers "connect once, use the user's own OpenAI/Anthropic billing" via OAuth with no key pasting into Thought Tidy. Pollinations BYOP and Puter offer user-pays OAuth-style flows but bill their own balances. OpenAI SIWC plan usage is the only official subscription-linking path and is gated for paid apps; Claude subscriptions cannot be used.

### Cited Findings
| Option | User connects | App auth | User's own OpenAI/Anthropic billing? | Fees | Ext / desktop | Maturity |
|---|---|---|---|---|---|---|
| OpenRouter OAuth | OpenRouter account (+ optional BYOK keys) | PKCE, no client registration, returns user key with limit/expiry | Yes via account BYOK ($25k/mo free, then 5%) | 5.5% on credit purchases | Any-port localhost; https callbacks; headless code-paste | Mature -- [OAuth](https://openrouter.ai/docs/guides/overview/auth/oauth), [BYOK](https://openrouter.ai/docs/guides/overview/auth/byok), [pricing](https://openrouter.ai/pricing) |
| Pollinations BYOP | Pollinations account (pollen) | PKCE code / device flow, `pk_` app key, 7-day `sk_` | No | Optional +25% to developer | Exact-match redirects, localhost any port, browser fetch exchange | Newer -- [BYOP](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md) |
| Puter.js | Puter account (popup) | SDK session, no keys | No | Hidden (Puter pricing) | CDN script conflicts with MV3; Node `getAuthToken` | Established SDK, no SLA -- [user-pays](https://docs.puter.com/user-pays-model/), [MV3 rule](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code) |
| OpenAI SIWC plan usage | ChatGPT account | PKCE, dynamic client, `127.0.0.1` loopback | Yes (ChatGPT plan, not API) | Counts against plan | Electron OK; extension not documented | Preview, partner-gated for paid apps -- [SIWC](https://developers.openai.com/siwc/token-sharing-open-source/sign-in) |
| Claude subscription | -- | Not permitted | -- | -- | -- | Prohibited -- [Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview) |
| Vercel/Cloudflare/Portkey/LiteLLM/Requesty | Developer dashboard | Gateway key | Team BYOK only (Vercel per-request raw key) | Vercel $0.20/1k BYOK w/o fallback | Needs backend | Mature, dev-side -- [Vercel](https://vercel.com/docs/ai-gateway/authentication-and-byok/byok), [Cloudflare](https://developers.cloudflare.com/ai-gateway/configuration/bring-your-own-keys/) |

### Inferences
- Lowest-effort improvement: document/promote OpenRouter BYOK so users attach their OpenAI/Anthropic keys in OpenRouter once; pass `limit` and `expiration` on the existing OAuth call.
- Pollinations BYOP is a low-effort second OAuth option with built-in developer revenue (+25%), useful if the hosted subscription is to be complemented.
- SIWC is strategically important (true "use your ChatGPT plan") but requires an interest-form application and an Electron loopback implementation; the extension could route through the desktop app.
- Paid Pro features do not conflict with OpenRouter or Pollinations flows per their docs; Puter and OpenAI commercial terms need review.

### Gaps
- No primary-source ToS review was done for OpenRouter, Pollinations, or Puter regarding source-available apps with paid features.
- No hands-on test of any flow from an MV3 extension origin was performed.
