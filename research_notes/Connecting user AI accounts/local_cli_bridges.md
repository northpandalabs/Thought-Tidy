# Local CLI Bridges: Reusing the User's Installed Codex CLI / Claude Code / Gemini CLI from Thought Tidy (as of 2026-11-18)

Scope note: Thought Tidy is a source-available app with paid Pro features and a paid hosted subscription. That matters because several vendor rules turn on whether a product is "commercial". Primary docs were fetched on 2026-11-18 unless marked otherwise. Secondary-only claims are flagged **[secondary]**.

## Q1. Codex CLI: exec / app-server / SDK, ChatGPT-login reuse, and whether OpenAI permits it

### Takeaway
Technically this is easy. `codex app-server` is a documented stdio JSON-RPC interface, and it can own the ChatGPT login and report plan and rate limits. But OpenAI's own app-server docs now say app-server authentication "has never been permitted for commercial or hosted services". Local or open-source apps that already use it may keep going, but OpenAI recommends moving to the official **Sign in with ChatGPT** (SIWC) program, which reached plan usage at DevDay on 2026-09-29 and is still in limited preview with a partner waitlist. A paid app like Thought Tidy should treat SIWC as the sanctioned route, not driving the user's Codex install.

### Cited Findings
- **What app-server is:** "Codex app-server is the interface Codex uses to power rich clients (for example, the Codex VS Code extension)." It is aimed at deep integration: auth, conversation history, approvals, and streamed agent events. -- [OpenAI Codex docs: App Server](https://learn.chatgpt.com/docs/app-server) (developers.openai.com/codex/app-server now 308-redirects here)
- **Transports:** stdio (default, newline-delimited JSON-RPC), WebSocket via `--listen ws://IP:PORT` ("experimental and unsupported"), and a Unix socket. Non-loopback WebSocket listeners "allow unauthenticated connections by default during rollout". -- [App Server docs](https://learn.chatgpt.com/docs/app-server)
- **Client identity:** Clients should set `clientInfo.name` because it feeds "the OpenAI Compliance Logs Platform". Enterprise integrators are told to "contact OpenAI to get it added to a known clients list". So OpenAI can see which third-party client is driving app-server. -- [App Server docs](https://learn.chatgpt.com/docs/app-server)
- **Auth modes in app-server:**
  - `apikey`
  - `chatgpt`: "Codex owns the ChatGPT OAuth flow, persists tokens, and refreshes them automatically."
  - `chatgptAuthTokens`: "experimental and intended for host apps that already own the user's ChatGPT auth lifecycle."
  - RPCs: `account/login/start` (apiKey, chatgpt, chatgptDeviceCode, or chatgptAuthTokens), `account/read` (reports account and plan details), `account/rateLimits/read` ("ChatGPT rate limits").
  -- [App Server docs, auth section](https://learn.chatgpt.com/docs/app-server)
- **Key policy sentence (verbatim):** "App-server authentication has never been permitted for commercial or hosted services." The same paragraph says local or open-source apps built on app-server auth can keep using it, recommends migrating to Sign in with ChatGPT, says SIWC was launched for those use cases, and invites readers to join a partner waitlist. The docs do not define "commercial", "hosted", or "local/open-source". -- [App Server docs](https://learn.chatgpt.com/docs/app-server)
- **Codex auth basics:** Two methods: "Sign in with ChatGPT for subscription access" or "Sign in with an API key for usage-based access". ChatGPT sign-in "is the default authentication path when no valid session is available."
  - Storage is set by `cli_auth_credentials_store`: `file` (`auth.json`), `keyring` (OS credential store, "fails if it is unavailable"), or `ephemeral`.
  - The docs steer automation to API keys: "Use API key authentication for programmatic Codex CLI workflows, such as CI/CD jobs." Also: "Don't expose Codex execution in untrusted or public environments."
  -- [OpenAI Codex docs: Authentication](https://learn.chatgpt.com/docs/auth)
- **Windows:** `CODEX_HOME` defaults to `%USERPROFILE%\.codex`, and the keyring backend is Windows Credential Manager. -- [developertoolkit.ai Codex auth guide](https://developertoolkit.ai/en/codex/quick-start/authentication.md) **[secondary]**
- **Sign in with ChatGPT for third-party plan usage:** Announced at DevDay on 2026-09-29 in limited preview. It extends a July 2026 beta that covered only identity linking.
  - Plus/Pro users can spend their plan allowance in third-party tools, with per-app weekly caps.
  - Launch partners reportedly include OpenCode, Devin, Amp, Warp, Conductor, Notion, and Vercel.
  -- [The New Stack](https://thenewstack.io/sign-in-with-chatgpt/) (403 on fetch; search snippet only) **[secondary]**; [buildmvpfast summary](https://www.buildmvpfast.com/blog/codex-usage-limits-sign-in-with-chatgpt-v0-notion-opencode-2026) **[secondary]**
- **SIWC eligibility:** OpenAI's help article "Using your ChatGPT plan in other apps and sites" reportedly says the launch began with "open-source projects, personal projects that run locally, and selected private apps". It also says a connected app "uses your Codex / ChatGPT work usage included in your plan". -- [OpenAI Help 11369540](https://help.openai.com/en/articles/11369540-using-your-chatgpt-plan-in-other-apps-and-sites) (403 on direct fetch; quoted via search summary) **[secondary-of-primary]**
- **Real-world example, `arteeh/ki` issue #197 (opened 2026-11-16):**
  - The app currently signs in with the Codex app's OAuth client ID against `auth.openai.com` and calls the private endpoints `backend-api/codex/responses` and `wham/usage`. The issue calls this "the shakiest terms-of-service footing" of its vendors.
  - Route A is SIWC: dynamic client registration, Auth Code + PKCE with a loopback `127.0.0.1` callback, calls to `api.openai.com/v1/responses`.
  - Route B is spawning `codex app-server` as a child process, with `codex login` handling sign-in. The tradeoff is that Codex brings its own tools, prompt, and agent loop.
  - -- [GitHub arteeh/ki#197](https://github.com/arteeh/ki/issues/197)
- **Zed:** Users can sign in with ChatGPT under LLM Providers for Zed's built-in agent, using "the same usage you get in Codex". Zed also built a `codex-acp` adapter that runs Codex as an external agent in Zed, JetBrains, or any ACP client. Zed is "grateful that OpenAI continues to support subscription-based access for third-party tools". -- [Zed blog, 2026-05-15](https://zed.dev/blog/chatgpt-subscription-in-zed)
- **JetBrains:** The Codex integration in JetBrains AI chat (IDE 2025.3+) supports ChatGPT sign-in, an API key, or a JetBrains AI subscription. -- [Neowin](https://www.neowin.net/news/openais-codex-extension-is-now-available-for-jetbrains-ides/) **[secondary]**
- **Cline:** Cline has an "OpenAI Codex (Subscription OAuth)" provider. -- [enjoy.dev comparison](https://enjoy.dev/blog/chatgpt-subscription-other-apps/) **[secondary]**
- **App-server vs SDK:** For automation or CI, the app-server page says "use the Codex SDK instead". -- [App Server docs](https://learn.chatgpt.com/docs/app-server)

### Inferences
- Thought Tidy charges for Pro and a hosted subscription. If "drive the user's Codex via app-server or exec with their ChatGPT login" were gated behind Pro, it would very likely count as "commercial" under the app-server sentence. A free, BYO-login feature in a source-available app is a grey zone, because OpenAI never defines "commercial".
- The sanctioned path for a paid product is SIWC: register as a SIWC app, run OAuth PKCE, call `api.openai.com/v1/responses` on the user's plan. This works from the Electron main process and possibly from the extension. It avoids spawning a coding agent entirely, so there is no agent system prompt, no tools, and low latency. But it needs OpenAI approval or waitlist entry during the preview.
- Never reuse Codex's OAuth client ID or private `backend-api` endpoints. That is the pattern OpenAI's docs warn against, and other projects are now migrating off it.
- Because of `clientInfo.name` and Compliance Logs, a third-party app-server client is identifiable to OpenAI. Detection-based enforcement is plausible, but no enforcement example was found.

### Gaps
- I could not read the full SIWC developer docs or terms (eligibility criteria, whether paid apps qualify, review process). The help-center and New Stack pages returned 403.
- The `codex exec` page (`learn.chatgpt.com/docs/noninteractive`) returned 404, so I have no primary confirmation of current exec flags. Prior knowledge (`codex exec --json`, reads the same `auth.json`) is unverified for Nov 2026.
- No OpenAI enforcement actions (bans or warnings) against apps or users who drive Codex with a ChatGPT login were found.
- How T3 Code integrates Codex was not confirmed from primary sources. It is described as a UI over Codex and Claude Code, presumably via app-server.

## Q2. Claude Code: headless `claude -p`, stream-json, Agent SDK, and whether spawning the user's installed binary with their subscription is allowed

### Takeaway
Anthropic's Legal & Compliance page (current) has an explicit carve-out. The restriction does not "prevent an end user from signing in to the unmodified Claude Code binary with their own Claude subscription". But it also says developers may not "route requests through Free, Pro, Max, or Ultra plan credentials on behalf of their users", and the Agent SDK overview says third parties may not offer "claude.ai login or rate limits for their products" unless previously approved.

Anthropic's support center (2026-06-15) says "Claude Agent SDK, `claude -p`, and third-party app usage still draw from your subscription limits." That acknowledges T3 Code-style wrappers exist. The practical consensus, from Theo/T3 Code and secondary coverage, is that spawning the unmodified, user-logged-in `claude` binary is tolerated. Extracting or replaying OAuth tokens (OpenClaw, OpenCode) is what was blocked.

For a paid commercial app the text is still contradictory. Treat it as "tolerated, not sanctioned" unless Anthropic sales confirms.

### Cited Findings
- **Legal & Compliance, "Authentication and credential use" (verbatim):**
  - "OAuth authentication is intended exclusively for purchasers of Claude Free, Pro, Max, Ultra, Team, and Enterprise subscription plans and is designed to support ordinary use of Claude Code and other native Anthropic applications."
  - "Developers building products or services that interact with Claude's capabilities, including those using the Agent SDK, should use API key authentication... Anthropic does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, Max, or Ultra plan credentials on behalf of their users. Moreover, developers may not collect, store, or intermediate Claude.ai credentials or session tokens -- sign-in to a Claude account must complete through Anthropic's own flow."
  - "...Nor does it prevent an end user from signing in to the unmodified Claude Code binary with their own Claude subscription, including where a platform hosts Claude Code as described under *Can customers offer Claude Code in their products?* above."
  - "Anthropic reserves the right to take measures to enforce these restrictions and may do so without prior notice."
  - "Advertised usage limits for Pro, Max, and Ultra plans assume ordinary, individual usage of Claude Code and the Agent SDK."
  -- [code.claude.com Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)
- **"Can customers offer Claude Code in their products?" (verbatim excerpts):**
  - "preinstalling or running Claude Code in your products or services ... requires agreeing to our Commercial Terms of Service and complying with the conditions below".
  - "The Claude Code binary must not be modified ... customers may not remove, disable, or restrict any authentication method built into it (including methods that permit signing in with a Claude account or the user's own API key)."
  - "Customers may not pay for, resell, or intermediate Claude usage on their end users' behalf. Each end user must authenticate with their own Anthropic API key, Claude subscription plan credentials, or 3P inference provider credential".
  - Branding: you may say in plain text that your product "runs Claude Code", but you may not use Claude Code or Anthropic names or logos in your own product or feature name, or in a way that suggests endorsement.
  -- [Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)
- **Agent SDK overview:**
  - "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK. Use the API key authentication methods..."
  - The SDK is "A library that runs the Claude Code binary".
  - SDK use is governed by the Commercial Terms "including when you use it to power products and services that you make available to your own customers".
  - Branding: "Claude Agent" or "{YourAgentName} Powered by Claude" are allowed; "Claude Code" is not.
  -- [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)
- **Anthropic support, 2026-06-15 (verbatim):** "We've paused the previously-announced changes to Claude Agent SDK usage." Also: "For now, nothing has changed: Claude Agent SDK, `claude -p`, and third-party app usage still draw from your subscription limits." On 2026-10-07: Max, Ultra, and Team plans "now include monthly API credits" usable with an API key from a linked Console org, while plan-login SDK and `claude -p` use "still draw from your subscription limits". -- [Claude Help Center 15036540](https://support.claude.com/en/articles/15036540-use-the-agent-sdk-with-your-claude-plan)
- **Enforcement timeline [secondary, sources disagree on details]:**
  - ~2026-01-09: server-side blocks on subscription OAuth tokens used outside Claude Code.
  - 2026-02-20: terms updated to explicitly prohibit third-party OAuth use.
  - 2026-04-04: Pro/Max OAuth stopped working in OpenClaw, NanoClaw, OpenCode, etc.
  - 2026-04-10: OpenClaw creator Peter Steinberger temporarily banned, reinstated hours later.
  - 2026-05-13: Anthropic announced a monthly "Agent SDK credit" at API rates, due June 15.
  - 2026-06-15: that change was paused.
  - -- [betterclaw.io (updated 2026-10-09)](https://www.betterclaw.io/blog/openclaw-anthropic-subscription-ban) **[secondary, no primary links]**; [The Next Web](https://thenextweb.com/news/anthropic-openclaw-claude-subscription-ban-cost) **[secondary]**; [alternativeto.net, 2026-02](https://alternativeto.net/news/2026/2/anthropic-officially-bans-using-subscription-authentication-for-third-party-claude-use) **[secondary]**
- **Proposed credit amounts:** $20 for Pro, $100 for Max 5x, $200 for Max 20x. Never shipped. -- search summaries of [agenticwire](https://www.agenticwire.news/article/claude-agent-sdk-200-credit-dev-guide) and [digitalapplied](https://digitalapplied.com/blog/anthropic-claude-credit-overhaul-june-15-2026) **[secondary]**
- **T3 Code:**
  - It uses whatever the user's Claude Code CLI is logged in with. There is no T3 proxy or billing, and usage counts against the user's Anthropic account. -- [t3codedocs.com Claude Code provider](https://t3codedocs.com/providers/claude-code/) **[secondary/community docs]**
  - Theo (X): "T3 Code confirmed SAFE FOR CLAUDE SUBS ... We FINALLY have explicit confirmation that tools wrapping Claude Code for local use are allowed". -- [x.com/theo/status/2040221237503561780](https://x.com/theo/status/2040221237503561780) (not fetched; via search)
  - Theo later wrote: "Anthropic's ban is ONLY harnesses that aren't Claude Code (see: Pi, OpenCode etc)". -- [x.com/theo/status/2085621311909642621](https://x.com/theo/status/2085621311909642621) (not fetched)
  - An Anthropic employee replied that this was "not guidance or an update on the agent SDK, we're still working on clarity there". -- via search summary of [thenewstack anthropic-agent-sdk-confusion](https://thenewstack.io/anthropic-agent-sdk-confusion/) **[secondary]**
- **Earlier staff framing [secondary]:** Thariq Shihipar (Anthropic) described a February docs change as a cleanup that caused confusion. Anthropic said personal experimentation is fine, but "commercial services using the Agent SDK must use paid API access". -- [thenewstack](https://thenewstack.io/anthropic-agent-sdk-confusion/), [engineerscodex](https://www.engineerscodex.com/anthropic-claude-subscription-switcharoo) **[secondary; primary post not retrieved]**
- **Headless technical facts (primary):**
  - `claude -p` runs non-interactively and reads stdin (capped at 10MB).
  - `--output-format text|json|stream-json`; stream tokens with `--output-format stream-json --verbose --include-partial-messages`. The last line is a `result` message.
  - `--json-schema` gives structured output.
  - `--system-prompt` replaces the entire default prompt; `--append-system-prompt` adds to it.
  - `--max-turns`, `--no-session-persistence`.
  -- [Headless docs](https://code.claude.com/docs/en/headless); [CLI reference](https://code.claude.com/docs/en/cli-reference)
- **Tool and settings flags (CLI reference):**
  - `--tools`: "Use `""` to disable all" built-in tools; MCP tools need `--disallowedTools "mcp__*"`.
  - `--setting-sources`, `--strict-mcp-config`, `--disable-slash-commands`.
  -- [CLI reference](https://code.claude.com/docs/en/cli-reference)
- **Critical constraint, `--bare` vs subscription:** "bare mode doesn't use your subscription login. In bare mode, Claude Code never reads OAuth credentials or the system keychain." `--bare` is "the recommended mode for scripted and SDK calls, and will become the default for `-p` in a future release." Non-bare `-p` loads hooks, skills, MCP servers, and CLAUDE.md from cwd and `~/.claude`, and runs project hooks "even in a folder you've never trusted". -- [Headless docs](https://code.claude.com/docs/en/headless)

### Inferences
- **Literal reading.** Thought Tidy spawning the user's unmodified `claude` binary, already logged in through Anthropic's own `/login`, fits the carve-out ("end user ... signing in to the unmodified Claude Code binary with their own Claude subscription"). It also respects "sign-in must complete through Anthropic's own flow" and "no collecting/intermediating tokens", provided Thought Tidy never reads `~/.claude` credentials.
- **What still applies.** The "Can customers offer Claude Code" section still requires agreeing to the Commercial Terms. The Agent SDK note ("does not allow ... claude.ai login or rate limits for their products ... unless previously approved") pulls the other way, especially if the feature is a paid Pro feature.
- **Biggest planned risk.** If `--bare` becomes the default for `-p`, subscription login would stop working for `-p` callers unless they opt out. Combined with the paused-not-cancelled Agent SDK credit, that makes this route fragile. Design for "API key or SIWC first, local CLI bridge as an optional power-user feature".
- **Implementation hygiene.**
  - Run with `--tools ""`, `--disallowedTools "mcp__*"`, `--system-prompt` (Thought Tidy's own rewrite prompt), `--max-turns 1`, `--no-session-persistence`, and `--setting-sources` limited where possible.
  - Use an empty temp cwd, so a user's project hooks, MCP servers, or CLAUDE.md are not loaded and executed.
  - Do not brand the feature "Claude Code". Say "Uses your local Claude Code install".

### Gaps
- I found no primary Anthropic statement that names T3 Code, Zed, or local wrappers as approved. Theo's claims and the employee rebuttal were seen only via search snippets and secondary articles.
- I could not determine whether "ordinary, individual usage" covers a writing tool sending many short rewrites through `claude -p`.
- No documented enforcement (bans or warnings) was found against users of local-binary wrappers like T3 Code. All reported bans involve OAuth token extraction (OpenClaw, OpenCode) **[secondary]**.
- Whether Cline's or OpenCode's current Claude integrations use API keys only, or spawn the binary, was not verified.

## Q3. Agent Client Protocol (ACP) and similar standards

### Takeaway
ACP is now broadly adopted. About 50 agents are listed, including Gemini CLI, GitHub Copilot, Cline, Cursor, OpenCode, OpenClaw, and Junie. Claude Code and Codex join only via adapters (`claude-agent-acp`, which wraps the Agent SDK, and `codex-acp`). ACP is designed for coding-agent sessions in editors, so for short text rewrites it adds a full agent session and tool loop on top of the CLIs. It inherits each vendor's auth and terms, so it gives no extra licence. It is viable but heavyweight for Thought Tidy.

### Cited Findings
- **ACP agents list:**
  - Adapter-based: "Claude Agent" via Zed's SDK adapter (`claude-agent-acp`); "Codex CLI" via `codex-acp`; Pi via `pi-acp`; Bub via `bub-acp-server`.
  - Others listed (native or unstated): Gemini CLI, GitHub Copilot, Cline, Cursor, Goose, Junie (JetBrains), Kimi CLI, Kiro CLI, Mistral Vibe, OpenCode, OpenClaw, OpenHands, Qwen Code, Factory Droid, Augment Code, Docker cagent, and more.
  - The page does not discuss authentication.
  -- [agentclientprotocol.com Agents](https://agentclientprotocol.com/overview/agents)
- **Zed:** Zed built `codex-acp` to bring Codex "into Zed, JetBrains, or other ACP-compatible clients as an external agent". -- [Zed blog 2026-05-15](https://zed.dev/blog/chatgpt-subscription-in-zed)
- **Codex has no built-in ACP support:** a community adapter exists. -- [arteeh/ki#197](https://github.com/arteeh/ki/issues/197)

### Inferences
- `claude-agent-acp` runs the Agent SDK, which runs the Claude Code binary. Claude-via-ACP therefore has the same Anthropic terms posture as Q2, plus the Agent SDK "no claude.ai login for their products" note.
- For Thought Tidy, ACP's value would be one client implementation that reaches many agents. The cost is an agent-session protocol (sessions, tool permissions, file system callbacks) where a plain completion is needed. Direct `claude -p` or `codex app-server`, or better SIWC or API keys, is simpler.

### Gaps
- I did not fetch the ACP spec for auth methods (e.g. an `authenticate` method) or the list of ACP clients. The agents page lists no clients.
- No statement from Anthropic sanctioning Zed's `claude-agent-acp` with subscription login was found.

## Q4. Gemini CLI / Antigravity CLI: login reuse by third-party apps

### Takeaway
Google is the strictest of the three. Its docs say that accessing the services behind Gemini CLI with third-party software (the OpenClaw example) "is a violation" and "may be grounds for suspension or termination". Mass 403 ToS suspensions of paid and Ultra users of OpenClaw and OpenCode have been reported since Feb 2026. Whether spawning the official signed CLI (`agy --print`) from another app is allowed is an open, unanswered question on Google's forum. Gemini CLI was also replaced by Antigravity CLI for free and Google One users on 2026-06-18. Do not build on this login.

### Cited Findings
- **Terms quote (verbatim):** "Directly accessing the services powering Gemini CLI (for example, the Gemini Code Assist service) using third-party software, tools, or services (for example, using OpenClaw with Gemini CLI OAuth) is a violation of applicable terms and policies. Such actions may be grounds for suspension or termination of your account."
  - The page was last updated Apr 10, 2026.
  - A banner says that for unpaid and Google One users, Gemini CLI "was replaced by Antigravity CLI on June 18th, 2026."
  - Terms depend on auth method: Google ToS plus Google One terms for AI Pro/Ultra; GCP terms for Code Assist Standard/Enterprise; Gemini API ToS for API keys.
  -- [Gemini CLI ToS & Privacy](https://geminicli.com/docs/resources/tos-privacy)
- **Open question on Google's forum:** A thread asks whether launching the unmodified `agy --print` from a third-party VS Code extension or desktop tool is acceptable (posted 2026-07-20, follow-up 2026-10-16). There is no Google staff answer.
  - The Antigravity Additional Terms prohibit "using third party software, tools, or services to access the Service" and "using the Service in connection with products not provided by us".
  - A community reply says "That's fine" (opinion only).
  -- [Google AI forum thread 175462](https://discuss.ai.google.dev/t/is-invoking-the-official-antigravity-cli-agy-print-from-a-third-party-developer-tool-an-acceptable-use/175462)
- **Enforcement:** Numerous forum appeals report "403 ToS violation" suspensions of Gemini CLI, Antigravity, and Gemini API access after using OpenClaw or OpenCode, including paid and Ultra tiers. -- [forum: mass 403 bans](https://discuss.ai.google.dev/t/urgent-mass-403-tos-bans-on-gemini-api-antigravity-for-open-source-cli-users-paid-tier/124508); [forum: OpenClaw suspension appeal](https://discuss.ai.google.dev/t/account-suspended-403-tos-due-to-openclaw-usage-appeal-and-explanation/136321); [cybersecuritynews, Oct 2026](https://cybersecuritynews.com/google-suspends-openclaw-users/) **[user reports / secondary]**

### Inferences
- The "in connection with products not provided by us" wording could cover any launcher, including one that spawns the official binary. Given real suspensions and no clarification, a Gemini or Antigravity bridge carries real account-ban risk for Thought Tidy's users. Offer Gemini via the user's own Gemini API key only, which Thought Tidy already supports.

### Gaps
- I did not fetch the exact text of the Antigravity Additional Terms. The quotes above come from the forum post.
- Google has given no statement on spawning the CLI binary.

## Q5. Practical concerns: latency, agent overhead, prerequisites, Windows

### Takeaway
Spawning a coding agent for a two-second rewrite is slow and heavy.
- A clean `claude -p --bare` "hi" takes about 2s, but `--bare` cannot use subscription login.
- Default `-p` runs that load hooks, MCP, and skills commonly take 6-20s+. Windows outliers reach 75-80s.
- Each spawn may load roughly 16K-50K tokens of agent system prompt and tool definitions unless they are stripped.

Mitigations: replace the system prompt, disable tools, run from an empty cwd, and keep a persistent process (stream-json input or app-server) instead of spawning per request. Prerequisites are significant: the user must install the CLI and log in from a terminal.

### Cited Findings
- **Official mitigation:** `--bare` "reduce[s] startup time by skipping auto-discovery of hooks, skills, custom commands, subagents, installed plugins, MCP servers, auto memory, and CLAUDE.md", but needs `ANTHROPIC_API_KEY` or `apiKeyHelper`. -- [Headless docs](https://code.claude.com/docs/en/headless)
- **Persistent process:** `--input-format stream-json` exists, so one long-lived process can take many prompts. `--max-turns` applies per turn. -- [CLI reference](https://code.claude.com/docs/en/cli-reference)
- **Measured latencies (user-reported GitHub issues, mirrored on claudeissues.com) [secondary/anecdotal]:**
  - About 2.05s for `claude -p "hi" --bare`.
  - 6-8s for a bare boot in another report.
  - 75s with all MCP, tools, and skills loaded vs 9s with them disabled.
  - "Claude Agent SDK: 80+ second startup time on Windows".
  - "Windows 75s of silent unlogged startup phases".
  - Headless runs stalling a constant ~405s (Aug 2026, v2.1.220-221).
  - Estimate of ~16K-50K tokens of system prompt and tools per new `claude -p` process.
  -- [issue 76393](https://claudeissues.com/issue/76393-claude-code-interactive-hi-12s-vs-grok-2-8s-bare-p-is-not-the-real-path); [issue 16005](https://claudeissues.com/issue/16005-claude-agent-sdk-80-second-startup-time-on-windows); [issue 85050](https://claudeissues.com/issue/85050-bug-windows-75s-of-silent-unlogged-startup-phases-ending-at-skills-idle-schedule); [issue 83859](https://claudeissues.com/issue/83859-headless-claude-p-runs-stall-for-a-constant-405s-early-in-every-session-9-9-sinc); [issue 43655 (--fast request)](https://claudeissues.com/issue/43655-feature-add-fast-flag-for-minimal-cli-boot-in-p-print-mode)
- **Usage drain [secondary]:** The T3 Code FAQ reportedly says Agent SDK usage drains the 5-hour limit faster than Claude Code itself. -- [t3code discussion #11226](https://github.com/pingdotgg/t3code/discussions/11226) **[secondary]**
- **Codex agent overhead:** Codex brings its own tools, prompt, and agent loop, which would need disabling. -- [arteeh/ki#197](https://github.com/arteeh/ki/issues/197)
- **Codex keyring on Windows:** `keyring` mode "fails if it is unavailable". `CODEX_HOME` must match between the GUI app and the spawned CLI, or they use different auth caches. -- [Codex auth docs](https://learn.chatgpt.com/docs/auth); [developertoolkit.ai](https://developertoolkit.ai/en/codex/quick-start/authentication.md) **[secondary]**

### Inferences
- **Recommended shape if built:**
  - Keep one persistent child per provider: `codex app-server` over stdio, or `claude -p --input-format stream-json --output-format stream-json`, started lazily from the Electron main process.
  - Use a temp cwd, the tools-off and system-prompt flags, and a 1-turn limit.
  - Resolve the binary on Windows (`claude.exe` native install, or `npm` shims needing `shell: true` / `.cmd`).
  - Surface "not installed" and "not logged in" states. With `-p`, a missing-auth failure is printed "as the result on stdout".
- Even optimized, expect first-token latency of 2-10s on Windows vs about 1s for a direct API or SIWC call. That hurts Thought Tidy's hotkey UX.

### Gaps
- No primary benchmark exists for `codex exec` or app-server startup latency on Windows.
- No measured data exists for non-bare `-p` with `--tools ""` plus `--system-prompt` (the subscription-compatible lean configuration).

## Q6. Browser extension variant via native messaging

### Takeaway
It is feasible. Chrome and Firefox native messaging launch a registered host executable that talks over stdin/stdout, and the host can in turn spawn `claude` or `codex app-server`. Anthropic's own "Claude in Chrome" uses this pattern (`com.anthropic.claude_code_browser_extension`), and third-party projects bridge extensions to a persistent Codex app-server. But it needs a separately installed host plus registry entries on Windows, and it has a long bug history. Practically, the Thought Tidy desktop app would act as the host, so the extension variant reduces to the desktop bridge plus the same ToS questions.

### Cited Findings
- **Chrome native messaging:** The host runs as a separate process communicating via stdin/stdout. `allowed_origins` lists the permitted extension IDs, and wildcards are disallowed. -- [Chrome docs: Native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
- **Claude Code's own host:** The manifest `com.anthropic.claude_code_browser_extension` runs the CLI with `--chrome-native-host`. There are recurring connection bugs, including on Windows ("extension never spawns native host on Windows"; "native messaging connection not initiated on Windows when Claude Desktop is closed"). -- [issue 74436](https://claudeissues.com/issue/74436-chrome-extension-never-spawns-native-host-on-windows-no-browsers-connected-despi); [issue 21607](https://claudeissues.com/issue/21607-bug-chrome-extension-native-messaging-connection-not-initiated-on-windows-when-c) **[user reports]**
- **Third-party Codex analogue:** A project bridges a Chrome extension to a local, persistent Codex app-server (or Qoder ACP) process. -- [chrome-relay architecture](https://chrome-relay.pages.dev/docs/architecture/) **[secondary, not fetched in full]**

### Inferences
- If Thought Tidy desktop is installed, the cleanest design is for the extension to talk to the desktop app (native messaging host, or a loopback channel the desktop already runs), and for the desktop to own the CLI child processes. Without the desktop app, a separate host installer would be needed. On Windows that means an HKCU registry key under `Software\Google\Chrome\NativeMessagingHosts` (and the Mozilla equivalent), which is standard but adds install friction.
- The ToS analysis is identical to Q1, Q2, and Q4. Native messaging changes the transport, not the licensing.

### Gaps
- I did not fetch Firefox native messaging docs. They are assumed to be equivalent, which is well established but unverified here.
- No example of a writing or productivity extension (not a coding tool) bridging to these CLIs was found.
