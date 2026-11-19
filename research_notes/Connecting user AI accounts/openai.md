# OpenAI: mechanisms for users to connect their own OpenAI / ChatGPT account to Thought Tidy (as of Nov 18, 2026)

Scope note: Primary sources are developers.openai.com pages fetched on 2026-11-18. The OpenAI Help Center article (help.openai.com/en/articles/20001542) returned HTTP 403 to automated fetches; its content is known only via search-engine summary and secondary articles, and is flagged as such. Secondary sources (WorkOS blog, flaviocopes.com, community forums, T3 Code GitHub) are flagged inline.

Options identified:
1. Sign in with ChatGPT (SIWC) -- "ChatGPT plan usage" (a.k.a. token sharing, scope `chatgpt.tokens.use.direct`). The only official mechanism that bills AI requests to a user's ChatGPT subscription.
2. SIWC identity-only (website flow). Login only, no billing; limited commercial trial.
3. User-supplied OpenAI Platform API key (status quo). No official OAuth/PKCE key-provisioning flow exists.
4. ChatGPT Plugins (formerly Apps SDK / "Apps in ChatGPT"), MCP-based. Runs inside ChatGPT, not in Thought Tidy's own UI.
5. Unofficial: reusing the Codex CLI's OAuth client/tokens. Not an official third-party mechanism.

## 1. SIWC plan-usage eligibility: open-source self-registration vs paid/hosted apps -- would a source-available app with paid features qualify?

### Takeaway
The OSS plan-usage docs are explicitly written "for open-source and locally hosted apps"; anyone "interested in offering it in a paid or remotely hosted app" is pointed to an interest form, and the general client-ID page says SIWC "is currently offered to a select group of commercial partners." Thought Tidy is source-available rather than OSI open source, sells Pro features, and runs a hosted subscription, so it most plausibly falls in the "paid" bucket that needs the interest form. OpenAI says nothing explicit about monetized or source-available OSS.

### Cited Findings
- Overview text, verbatim: "ChatGPT plan usage is an optional capability within Sign in with ChatGPT." / "These docs explain ChatGPT plan usage for open-source and locally hosted apps." Paid and remotely hosted apps are directed to the interest form ("If you're interested in offering it in a paid or remotely hosted app...") -- [OpenAI: ChatGPT plan usage overview](https://developers.openai.com/siwc/token-sharing-open-source)
- "The OAuth flow for OSS clients registers a user-defined agent during Sign in with ChatGPT." The page calls this a "dynamic-registration flow." It never uses the words "commercial," "self-registration," or "eligibility," and does not define "open-source" (no license list, no mention of source-available licenses) -- [OpenAI: plan usage overview (.md)](https://developers.openai.com/siwc/token-sharing-open-source.md)
- First-time registration: start authorize with `client_id=dynamic_agent_client` plus `ext_agent_host_id` and `agent_name_hint`. The callback returns an issued `client_id` to save and reuse. "`dynamic_agent_client` is the first-time registration entrypoint, not the client ID to save or use for token exchange." "This direct flow needs neither a client secret nor a partner API key." -- [OpenAI: Registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- Request-a-client-ID page: "Sign in with ChatGPT is currently offered to a select group of commercial partners." "To join the waitlist, complete the Sign in with ChatGPT interest form." No review criteria, timelines, or monetization rules are published -- [OpenAI: Request a client ID](https://developers.openai.com/siwc/request-client-id)
- Website (identity) flow: "currently available to selected commercial partners through a limited trial" -- [OpenAI: SIWC on your website](https://developers.openai.com/siwc/website)
- Error docs: use `force_reconsent=true` "only after OpenAI confirms deployment for your integration" (`prompt=consent` otherwise). This implies some per-integration enablement on OpenAI's side even for OSS clients -- [OpenAI: Errors and recovery](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery)
- Secondary: "Open source tools that run on the user's own computer need no approval from OpenAI ... registers itself on first sign-in"; "Commercial sign-in for websites and hosted apps is a limited trial with selected partners" -- [flaviocopes.com (third-party)](https://flaviocopes.com/sign-in-with-chatgpt/)
- Secondary: Plan-usage launch partners announced at DevDay (Sep 29, 2026) included commercial products (Amp, Conductor, Devin, Notion, Vercel, Warp, Kilo Code, etc.) and open-source tools (OpenClaw, OpenCode, Pi, T3 Code). Paid/remotely hosted products "describes most B2B SaaS" and go through the interest form -- [WorkOS blog (third-party)](https://workos.com/blog/sign-in-with-chatgpt-plan-usage-scope); [flaviocopes.com (third-party)](https://flaviocopes.com/sign-in-with-chatgpt/)
- Secondary: apps may still charge for their own features. Example: Dactyl's agent uses the ChatGPT plan, while compiling, image generation, and publishing use Dactyl credits -- [flaviocopes.com (third-party)](https://flaviocopes.com/sign-in-with-chatgpt/)
- Primary UI guidelines assume apps with their own paid plans. They tell developers to "Distinguish ChatGPT plan usage from your app's own subscription or charges," list "Use your ChatGPT plan" per eligible plan on the pricing page, and offer "buy credits" as a secondary action on limit errors -- [OpenAI: UI/UX guidelines](https://developers.openai.com/siwc/ui-ux-guidelines)

### Inferences
- The dynamic-registration flow is technically self-serve. Nothing in the flow checks the app's license. But the docs scope it to "open-source and locally hosted apps" and route "paid" apps to the form. An app with paid Pro features is the case the "paid" clause most naturally covers, even if it is local and the source is published.
- "Source-available" (not OSI-approved) is a further gray area. OpenAI does not define "open-source," and Thought Tidy's license may not qualify under the ordinary meaning.
- The UI guidelines mention app subscriptions, credits, and pricing pages, which suggests the commercial/partner track is how monetized apps are meant to use plan usage. That track is waitlisted.
- Lowest-risk path: submit the interest form, describing the app as a local desktop app with optional paid features. Possible fallback (not confirmed by OpenAI): enable plan usage only in a free/OSS build. Whether OpenAI would accept that is unknown.
- Self-registering a monetized app without approval risks revocation of the issued client_id. This is unverified; no enforcement policy is published.

### Gaps
- No primary statement on monetized open-source or source-available apps, freemium apps, or apps that sell non-AI features only.
- The interest form's content, review criteria, and timelines were not accessible.
- No published definition of "locally hosted" or "paid" (paid app vs. paid features).
- I did not check the OpenAI Terms of Use or Services Agreement text on reselling or wrapping plan usage.

## 2. Which ChatGPT plans can use plan usage in third-party apps?

### Takeaway
Sources conflict. The OpenAI Help Center article (via search summary; direct fetch blocked) reportedly says Go, Plus, Pro, or Business subscribers can opt in. Developer docs and two third-party articles from the launch period mention only Plus and Pro. Free and Enterprise/Edu are not listed as eligible anywhere I found.

### Cited Findings
- Help Center article "Using your ChatGPT plan in other apps and sites": search summary states "Go, Plus, Pro, or Business subscribers can also opt in to plan use for AI requests in participating commercial apps"; sign-in (identity) is separate from plan usage; plan use does not share conversations, memories, or an API key; plan-funded requests draw on the included "Work and Codex" allowance; users can cap each app's weekly share in Settings > Usage; feature is a "limited preview" -- [OpenAI Help Center (403 to fetch; content via search summary only)](https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites)
- Primary developer docs mention only Plus and Pro. "For ChatGPT Plus users, the five-hour usage limit is shared across all apps" where they use their plan, including private and open-source clients; the five-hour limit does not apply to Pro -- [OpenAI: Accounts and sessions](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)
- Secondary (Oct 1-2, 2026): "Only ChatGPT Plus and Pro subscribers can grant plan usage" -- [WorkOS blog (third-party)](https://workos.com/blog/sign-in-with-chatgpt-plan-usage-scope); also Plus and Pro only per [flaviocopes.com (third-party)](https://flaviocopes.com/sign-in-with-chatgpt/)
- Secondary: usage draws from the same "Codex / ChatGPT work usage" pool as Codex. Per-app weekly caps are a percentage of the plan and do not reserve allowance. When the cap or plan limit is hit, requests stop with no automatic fallback billing. OpenAI-approved apps can also spend a ChatGPT credits balance -- [flaviocopes.com (third-party)](https://flaviocopes.com/sign-in-with-chatgpt/)
- Secondary: a $500 Pro tier at 25x Plus usage launched alongside plan usage. The $200 plan's included usage drops from 20x to 10x Plus after Oct 29 for new subscribers -- [WorkOS blog (third-party)](https://workos.com/blog/sign-in-with-chatgpt-plan-usage-scope)
- The error `subscription_sharing_user_not_eligible` (403) means plan usage "is unavailable for the user, workspace, or policy"; apps should explain and not loop through OAuth -- [OpenAI: Errors and recovery](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery)

### Inferences
- Go and Business were likely added after launch (the Help Center summary is newer than the Oct articles), but this is unconfirmed. Thought Tidy should handle `subscription_sharing_user_not_eligible` gracefully and fall back to an API key or its hosted plan.
- Free-tier ChatGPT users (probably most casual writing-assistant users) appear ineligible. That limits plan usage as a replacement for BYO key or hosted plans.

### Gaps
- Could not fetch the Help Center article directly to confirm the exact plan list, Enterprise/Edu status, or admin controls.
- No published numeric caps per plan.

## 3. Browser-extension redirect URIs, CORS from browser JS, and guidance on tokens in browser JS

### Takeaway
The OSS plan-usage flow documents only an HTTP loopback redirect on `127.0.0.1`, and says to keep tokens out of browser storage. Neither the `chromiumapp.org` / Firefox identity redirect nor CORS is documented. The browser extension surface is effectively unsupported or contrary to guidance. The Electron desktop app fits the documented pattern: a loopback listener plus calls from the main process.

### Cited Findings
- Redirect: "Use an HTTP loopback callback on `127.0.0.1`", e.g. `http://127.0.0.1:1455/auth/callback`. Start the listener before opening the browser. Port may vary between sign-ins, but scheme, host, and path must not change. "Do not substitute with `localhost`." No custom schemes, https, or extension redirect URIs are mentioned -- [OpenAI: Registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- Endpoints: authorize `https://auth.openai.com/api/accounts/authorize`; token `https://auth.openai.com/api/accounts/oauth/token`; resource `https://api.openai.com/v1`. PKCE S256; fresh `state`, `nonce`, and verifier per attempt. Scopes: `openid profile email` + `offline_access resource.invoke chatgpt.tokens.use.direct`. Verify `chatgpt.tokens.use.direct` is in granted scopes before inference -- [OpenAI: Registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- Storage: keep access, refresh, and ID tokens in "protected local or self-hosted runtime storage"; "Keep tokens out of browser storage, source control, logs, analytics, and support transcripts"; never put tokens in URLs -- [OpenAI: Accounts and sessions](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)
- Website (identity) flow: supports public (no secret) and confidential clients with exact-match registered redirect URIs (example is HTTPS). The guide assumes a backend and says not to return ID tokens, PKCE verifiers, or client secrets to browser JavaScript. Plan usage "has a separate authorization and registration flow" -- [OpenAI: SIWC on your website](https://developers.openai.com/siwc/website)
- Secondary: the sample tool's `127.0.0.1` redirect means "server-hosted tools can't use this redirect directly" -- [flaviocopes.com (third-party)](https://flaviocopes.com/sign-in-with-chatgpt/)
- Self-hosted VM guidance exists: "securely transfer the SIWC credentials associated with the selected ChatGPT account" -- [OpenAI: plan usage overview (.md)](https://developers.openai.com/siwc/token-sharing-open-source.md)

### Inferences
- An MV3 extension cannot run a `127.0.0.1` HTTP listener. `chrome.identity.launchWebAuthFlow` requires a `https://<id>.chromiumapp.org/` redirect, which is not a documented redirect form, and `browser.storage.local` is "browser storage" that OpenAI says to keep tokens out of. A direct extension integration therefore contradicts the documented flow.
- Workable architecture (my inference, not OpenAI guidance): the Electron app does OAuth in the main process (loopback listener on `127.0.0.1`), stores tokens with OS-protected storage (e.g. Electron `safeStorage`), and makes `/v1/responses` calls from the main process (`desktop/lib-node/`), not the renderer. The extension could reach plan usage only by relaying through the desktop app (e.g. native messaging), keeping tokens out of the browser.
- The current pattern of calling from renderer JS would need to move to the main process for SIWC tokens, per the "browser storage" guidance and the website guide's "not to browser JavaScript" stance.

### Gaps
- CORS: no OpenAI doc states whether `api.openai.com/v1/responses` accepts browser-origin requests with SIWC tokens. Not tested.
- No statement on whether additional redirect URI types can be registered for partner (non-dynamic) clients.
- Device-code flow: not documented for plan usage.

## 4. Responses API restrictions, models endpoint, caps, required UI/branding

### Takeaway
Plan usage works only on `POST /v1/responses`. Every request must set `store:false` and `stream:true`; system-role items are rejected, and `temperature`, `top_p`, `previous_response_id` (HTTP), and several other parameters are unsupported. `GET /v1/models` returns the account's models. Branding is prescribed: "Continue with ChatGPT", a "Using ChatGPT plan" indicator, and a "Manage usage" link to chatgpt.com/settings/usage.

### Cited Findings
- Endpoint: `POST https://api.openai.com/v1/responses`, `Authorization: Bearer <ACCESS_TOKEN>`. Do not use ChatGPT `backend-api`. Success only on `response.completed`; handle `response.incomplete`, errors, and interrupted streams separately. Example models in docs: `gpt-6.1-sol` (curl) and `gpt-6.2-sol` (Python) -- [OpenAI: Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
- Models: `GET https://api.openai.com/v1/models` with the same token. The response has a `models` array; keep `visibility == "list"`, preserve ordering, show `display_name`, and send `slug` as `model`. Refresh on account switch -- [OpenAI: Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
- Restrictions: "HTTP requests must set `store: false` and `stream: true`." Explicit system-role message items are rejected; use `instructions` or developer messages. Unsupported (omit) parameters include `background`, `conversation`, `temperature`, `top_p`, `truncation`, `user`, `metadata`. `previous_response_id` is unsupported over HTTP, so history goes in `input`. Function/custom tools are supported. Image generation, file search, Code Interpreter, computer use, hosted MCP/connectors, and `tool_search` are not. Text, image, and file inputs are supported if the model accepts them; audio/video, Files API, and transcription are not -- [OpenAI: Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
- `max_output_tokens`: the primary page as fetched lists unsupported params with "including", and `max_output_tokens` was not in the extracted list. The secondary source says `temperature` and `max_output_tokens` "must be omitted" -- [WorkOS blog (third-party)](https://workos.com/blog/sign-in-with-chatgpt-plan-usage-scope). The error `subscription_sharing_unsupported_capability` (400, with `error.param`) identifies unsupported inputs -- [OpenAI: Errors and recovery](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery)
- Caps and errors: `subscription_sharing_usage_limit_exceeded` (429; link to ChatGPT Settings > Usage; may be an app-specific cap; don't infer reset time); `subscription_sharing_usage_unavailable` (503); `subscription_sharing_user_not_eligible` (403); `subscription_sharing_route_not_supported` (403); `subscription_sharing_invalid_user` (401). Usage errors may arrive as `response.failed` after streaming starts. "OpenAI doesn't currently notify your tool when a user disconnects the app." -- [OpenAI: Errors and recovery](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery); [OpenAI: Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
- Tokens: access token lifetime 3600 s; refresh token 30 days, rotating (each refresh issues a new 30-day token); token response includes `earliest_refresh_at` -- [OpenAI: Token reference](https://developers.openai.com/siwc/token-sharing-open-source/token-reference). Refresh: form POST to the token endpoint with `grant_type=refresh_token`, issued `client_id`, `refresh_token`, `resource=https://api.openai.com/v1`; serialize refreshes per session. Sign-out: revoke at the OIDC `revocation_endpoint` -- [OpenAI: Accounts and sessions](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)
- Required UI: "Continue with ChatGPT" button with ChatGPT logo. First-sign-in welcome modal titled "You're using your ChatGPT plan." with "Got it." Option heading "Use your ChatGPT plan", offered in onboarding/billing and kept in settings. "Using ChatGPT plan" shown near composer/model selector whenever a request uses the plan, with a "Manage usage" link to https://chatgpt.com/settings/usage. Usage-limit modal has "Manage usage" as the primary action, with app credits as the optional secondary. Pricing page lists "Use your ChatGPT plan" per eligible plan with "Learn more" to the Help Center -- [OpenAI: UI/UX guidelines](https://developers.openai.com/siwc/ui-ux-guidelines)

### Inferences
- Thought Tidy's Chat Completions calls (system role, temperature, likely max_tokens, non-streaming) would need a separate Responses API code path: `instructions` instead of a system message, no temperature, streaming SSE parsing, and `store:false`.
- The rewrite/summarize use case is compatible: text-only, no hosted tools.
- A hotkey-driven rewrite has no "composer," but the "Using ChatGPT plan" indicator still needs a home (popup, overlay, or settings) to follow the guidelines.

### Gaps
- No numeric rate limits published.
- Primary confirmation of `max_output_tokens` status is missing.

## 5. Is there an OpenAI Platform OAuth flow for third-party apps to obtain an API key / project key on a user's behalf (OpenRouter-style PKCE)?

### Takeaway
I found no such official mechanism. OpenAI documents no OAuth/PKCE flow that mints a Platform API key, project key, or service account for a third-party app, and no "Connect OpenAI account" that bills the user's API organization. Developers still ask for one on the community forum. The only official delegated-billing mechanism is SIWC plan usage, which bills ChatGPT plans, not Platform API credit.

### Cited Findings
- Secondary: "the Platform API has no authorize endpoint for minting a user-billed key"; third-party tools work around this by reusing Codex OAuth tokens via a localhost proxy -- [Puter developer tutorial (third-party)](https://developer.puter.com/tutorials/openai-oauth/)
- Community feature requests (unanswered requests, not OpenAI statements): consumer-delegated OAuth access, restricted BYOK keys for client-side apps, and OAuth to avoid sharing secret keys -- [OpenAI Community: consumer-delegated AI access](https://community.openai.com/t/feature-request-consumer-delegated-ai-access-let-third-party-apps-use-my-ai-subscription-via-oauth/1395942); [OpenAI Community: restricted BYOK keys](https://community.openai.com/t/feature-request-restricted-byok-api-keys-for-client-side-applications/1392506); [OpenAI Community: BYOK/OAuth clarifications](https://community.openai.com/t/urgent-clarifications-needed-on-byok-bring-your-own-key-and-oauth-for-openai-api/330449)
- SIWC docs state plan usage "does not share an OpenAI API key" (Help Center, via search summary) and that the direct flow needs "neither a client secret nor a partner API key" -- [OpenAI Help Center (via search summary)](https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites); [OpenAI: Registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)

### Inferences
- BYO Platform API key (user-pasted) remains the only official way to bill a user's API account. The user pays per-token API pricing with no subscription allowance. Thought Tidy already does this.
- Reusing the Codex CLI's OAuth client ID or tokens outside Codex is not an OpenAI-sanctioned third-party mechanism. SIWC plan usage now supersedes it, and copying another app's client is likely a ToS risk (unverified).

### Gaps
- I did not find an explicit OpenAI statement that such a flow does not exist. This is absence of evidence from docs and searches, plus secondary claims.
- Did not review OpenAI Terms of Use / Services Agreement clauses on API-key sharing.

## 6. ChatGPT Apps SDK / Apps in ChatGPT (now "Plugins", MCP-based): could Thought Tidy run inside the user's ChatGPT subscription?

### Takeaway
OpenAI's developer docs now present this as "Plugins" (skills + MCP server + optional UI in ChatGPT/Codex). The old `window.openai` Apps SDK APIs are labeled "legacy." A Thought Tidy plugin would move the experience into ChatGPT, with no hotkey or in-page rewriting. Plugins cannot sell digital goods or subscriptions inside ChatGPT, and should offer functionality ChatGPT lacks natively. Plain rewrite/summarize is native ChatGPT capability, so this option fits poorly.

### Cited Findings
- Docs describe plugins as bundles of "skills, MCP servers, and optional UI"; "Build an MCP server for ChatGPT and Codex, with optional UI in ChatGPT." The Reference page covers "the legacy `window.openai` APIs." There is a ChatGPT Directory with submission and review, and a "Submit desktop-only plugins" guide for local MCP servers. Plans, surfaces, and who pays for inference are not stated -- [OpenAI: Plugins docs (apps-sdk path)](https://developers.openai.com/apps-sdk)
- Monetization: "Currently, plugins may conduct commerce only for physical goods." No selling of digital products, subscriptions, tokens, or credits. Plugins may let users sign in to an existing paid account and use features already included, but must not "display subscription plans, initiate new subscriptions, or promote upgrades," nor "Link directly to a checkout or other transactional page" (they may link to an informational plans page). No ChatGPT-specific surcharges; parity required with the external product -- [OpenAI: Plugin submission guidelines](https://developers.openai.com/apps-sdk/app-submission-guidelines)
- Purpose rule: plugins should "provide functionality or workflows that are not natively supported by the products' built-in capabilities." Copycat designs and pass-through "unofficial connectors" cannot be approved -- [OpenAI: Plugin submission guidelines](https://developers.openai.com/apps-sdk/app-submission-guidelines)
- There is also a "SIWC in your ChatGPT plugin" identity page, linking a plugin to the app's own accounts -- [OpenAI: SIWC landing (nav)](https://developers.openai.com/siwc)

### Inferences
- In a plugin, the ChatGPT model the user is already chatting with does the rewriting, so inference naturally draws on the user's ChatGPT plan. The plugin would add little beyond prompts/skills (e.g. Thought Tidy style presets) and would probably fail the "not natively supported" bar.
- UX difference: the user opens ChatGPT and pastes or asks, instead of selecting text and pressing a hotkey in any page or app. That abandons Thought Tidy's core value.
- Pro features could only be unlocked by sign-in to an existing Thought Tidy account. No upsell or checkout inside ChatGPT.

### Gaps
- The docs do not state which plans can use plugins or how plugin inference counts against plan limits.
- The rename from apps to plugins (timing, DevDay 2026 announcement) was not confirmed from an announcement post.

## 7. Real-world reference: T3 Code's managed ChatGPT login and known pitfalls (issue #17445)

### Takeaway
T3 Code (open-source, a DevDay plan-usage launch partner) runs managed "Connect with ChatGPT" and passes the access token to a spawned Codex app-server via the `ACCESS_TOKEN` env var. Long runs hit `401 token_expired` because the 1-hour access token was injected only at launch. The fix uses Codex's native `auth.command` so running sessions fetch fresh tokens on demand.

### Cited Findings
- Issue #17445 "[Bug]: Managed ChatGPT login gets expired-token 401 during long Codex runs": opened Oct 9, 2026, closed as completed Oct 22, 2026. Runs of roughly 20 to 60+ minutes failed with `401 ... token_expired` from `https://api.openai.com/v1/responses` on macOS, Windows, and Linux -- [GitHub pingdotgg/t3code #17445](https://github.com/pingdotgg/t3code/issues/17445)
- Root cause (maintainer triage): the app-server got the token once at launch via `ACCESS_TOKEN`. T3 renewed tokens in its own store, but the running process kept the stale one. `CodexChatGptAuth.access` renewed only when under 60 s remained, with no mid-turn renewal or 401 retry -- [GitHub #17445](https://github.com/pingdotgg/t3code/issues/17445)
- Fix: Codex native `auth.command` fetches tokens from T3 on demand (PR #17920: 30 s refresh interval, per-launch secret). Alternatives: #21420 (same approach) and #19895 (process-wide broker). Closing comment says it shipped via mirror PRs 21786/21787 (unverified) -- [GitHub #17445](https://github.com/pingdotgg/t3code/issues/17445); [PR #17920](https://github.com/pingdotgg/t3code/pull/17920)
- Related open issues: #16132 (next turn fails after renewal until restart), #14356 (renewal fails with `invalid_grant`), PR #16849 (release idle sessions after renewal) -- [GitHub #17445 linked items](https://github.com/pingdotgg/t3code/issues/17445)
- OpenAI's own docs confirm the pattern: with the `env_key` setup, "restart app-server with the renewed `ACCESS_TOKEN`, then resume the saved thread"; the app must refresh the OAuth token itself -- [OpenAI: Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
- T3 Code is listed as an open-source plan-usage app alongside OpenClaw, OpenCode, and Pi -- [flaviocopes.com (third-party)](https://flaviocopes.com/sign-in-with-chatgpt/)

### Inferences
- Thought Tidy's requests are short, single-shot rewrites, so mid-request expiry is unlikely. It still needs pre-request refresh (check `expires_in` / `earliest_refresh_at`), serialized refresh because refresh tokens rotate (`refresh_token_reused` is terminal), and a single owner of the token set (Electron main process) so the extension and renderer never hold stale copies.
- Calling `/v1/responses` directly over HTTP is simpler than Codex app-server for a text tool. app-server matters only for agentic coding use.

### Gaps
- Could not confirm the exact config name `openai_token_sharing` or T3 Code's provider code. `gh` CLI was unavailable and search found nothing.
- loginwith.ai directory (third-party) was not reviewed.
