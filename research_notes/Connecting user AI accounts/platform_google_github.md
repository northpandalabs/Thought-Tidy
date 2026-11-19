# Platform-provided and "client supplies the model" AI options for Thought Tidy (vs. Google/Gemini OAuth and GitHub) -- as of November 2026

Research date: 2026-11-18. Dates on each source are noted where visible. Secondary-only claims are flagged "[secondary]".

## Q1. Google / Gemini: can a third-party app use "Sign in with Google" OAuth so Gemini usage bills to the user's own account or Google AI Pro subscription?

### Takeaway
No. As of November 2026 there is no sanctioned way for a third-party app to spend a user's Google AI Pro/Ultra quota. A Google staff forum reply on 2026-11-16 says so directly. Gemini API OAuth works, but it bills a Google Cloud project, and Google documents it as a "testing" setup. Reusing Gemini CLI or Antigravity OAuth credentials in a third-party app explicitly violates Google's terms, and users have reported account suspensions for it.

### Cited Findings
- **Google staff, 2026-11-16 (thread opened 2026-11-10).** Mahesh_Sutar, role not shown, answered the question "official way for a third-party desktop app to use a user's Google AI Pro/Ultra subscription":
  - "There is no official way for a third-party application to call the Gemini API using an end user's Google AI Pro or Google AI Ultra subscription quota."
  - "subscription benefits for developer usage apply only within the Google AI Studio web interface."
  - "direct Gemini API calls are billed and managed through a Google Cloud project."
  -- [Google AI Developers Forum](https://discuss.ai.google.dev/t/question-official-way-for-a-third-party-desktop-app-to-use-a-users-google-ai-pro-ultra-subscription-with-gemini/199349)
- **Other developers report the same gap.** A separate forum thread asks whether a sanctioned program for third-party apps is planned. A GitHub issue in a third-party project summarizes Google forum replies: wrapping Google's CLI in third-party apps "is not supported under consumer plans," and third-party apps should use an AI Studio API key or Gemini Enterprise. -- [Forum thread](https://discuss.ai.google.dev/t/gemini-subscription-access-for-third-party-apps-is-a-sanctioned-program-planned/175577); [arteeh/ki issue #202](https://github.com/arteeh/ki/issues/202) [secondary]
- **Subscriptions do not raise API limits.** According to a search-result summary of the forum, Google staff said consumer plans (AI Pro/Ultra) "do not give any additional API rate limits or API quotas," though they "do provide some free API credits." I could not verify the "free API credits" part on a primary page. The 2026-11-16 staff reply above does not mention credits. -- [Forum thread](https://discuss.ai.google.dev/t/inquiry-regarding-gemini-api-limits-fixed-subscriptions-third-party-integration-and-estimated-daily-costs/176212) [secondary summary; unverified]
- **The official Gemini API OAuth quickstart (now at aistudio.google.com/docs/oauth):**
  - It positions API keys as the easy default and OAuth as the option for "stricter access controls."
  - Scopes: `cloud-platform` plus `generative-language.retriever` (ADC flow), or `generative-language.retriever` alone (Python flow).
  - The curl example sends `x-goog-user-project: <your project>`, which ties quota and billing to the developer's Cloud project.
  - It says: "This guide uses a simplified authentication approach that is appropriate for a testing environment."
  - It says that for apps used outside your Workspace org, "you must add and verify the authorization scopes that your app requires."
  - It does not mention end users of third-party apps or AI Pro subscriptions.
  -- [Gemini API OAuth quickstart](https://aistudio.google.com/docs/oauth)
- **Scopes required [secondary].** A connector vendor's docs say `cloud-platform` alone does not grant Gemini API access; a `generative-language` scope is required. They also say creating OAuth credentials requires a Google Cloud project with billing enabled. -- [StackOne docs](https://docs.stackone.com/connectors/googlegemini/guides/connector-profile/oauth-2-0) [secondary]
- **Google's general OAuth verification rules:**
  - Sensitive scopes need verification, typically 3-5 business days.
  - Restricted scopes need verification, plus a security assessment if the data is stored or transmitted on servers.
  - I found no primary page classifying the `generative-language.*` scopes as sensitive or restricted.
  -- [Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification); [Restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)
- **Gemini CLI terms (page last updated 2026-04-10):**
  - "Directly accessing the services powering Gemini CLI (for example, the Gemini Code Assist service) using third-party software, tools, or services (for example, using OpenClaw with Gemini CLI OAuth) is a violation of applicable terms and policies. Such actions may be grounds for suspension or termination of your account."
  - AI Pro/Ultra login is governed by Google ToS plus the Google One Additional Terms.
  - API-key use is governed by the Gemini API ToS.
  - Vertex AI is governed by the Google Cloud Service Terms.
  - A banner says: "Gemini CLI was replaced by Antigravity CLI on June 18th, 2026" for Unpaid tier and Google One users.
  -- [Gemini CLI ToS & Privacy](https://www.geminicli.com/docs/resources/tos-privacy)
- **Reported enforcement.** Many forum posts in 2026 from AI Pro/Ultra subscribers describe 403 "ToS violation" errors and account restrictions after using Gemini CLI or Antigravity OAuth through third-party tools (OpenClaw, OpenCode). Appeals often went unanswered. These are user reports, not official statements. -- [Forum: Mass 403 ToS bans](https://discuss.ai.google.dev/t/urgent-mass-403-tos-bans-on-gemini-api-antigravity-for-open-source-cli-users-paid-tier/124508); [Forum: Pro subscriber banned for OpenCode OAuth](https://discuss.ai.google.dev/t/paid-pro-subscriber-banned-instantly-for-testing-opencode-oauth/124403); [Forum: AI Pro suspension, April 2026](https://discuss.ai.google.dev/t/request-for-account-review-unintentional-tos-violation-silent-ban-on-gemini-cli-antigravity-april-2026/171345)
- **Personal-account login removed [secondary].** One source says Gemini CLI personal-account sign-in ended on 2026-06-18, and that "Login with Google" was removed for AI Pro/Ultra accounts. -- [Syntackle blog](https://syntackle.com/blog/google-gemini-ai-subscription-with-opencode/) [secondary]

### Inferences
- **"Sign in with Google" cannot shift cost to the user.** Gemini API OAuth would charge Thought Tidy's own Cloud project, because quota is tied to the OAuth client's project or `x-goog-user-project`. The only ways to put the cost on the user are:
  - the user brings their own AI Studio key (the current approach), or
  - the user signs in with their own Cloud project as the billing project. That means asking a consumer to create a GCP project with billing, which is poor UX.
- **No viable subscription-borrowing option.** Borrowing Gemini CLI or Antigravity OAuth credentials would violate Google's terms and could get users' Google accounts suspended. It should be ruled out, especially because Thought Tidy is source-available with paid features.
- **chrome.identity would not help.** `chrome.identity.getAuthToken` would mint a token for the extension's own OAuth client, which belongs to the developer's Cloud project, so the same billing problem applies. It is also Chrome-only (Firefox has `identity.launchWebAuthFlow`). This is my inference; I found no doc on chrome.identity with Gemini scopes.

### Gaps
- I found no primary doc classifying `generative-language.retriever` (or other generative-language scopes) as sensitive or restricted, and no doc on verification timelines for them.
- I found no Google doc on using `chrome.identity.getAuthToken` with Gemini scopes.
- I could not confirm the claim of "free API credits for AI Pro subscribers" on a primary source.
- I found no evidence of any announced Google "use your Gemini subscription in other apps" program as of Nov 2026. The staff reply suggests none exists.

## Q2. Browser built-in AI: Chrome (Gemini Nano), Firefox, Edge

### Takeaway
- **Chrome:** Summarizer, Translator and Language Detector are stable since Chrome 138 on web and in extensions. The Prompt API is available to extensions since Chrome 138 and reportedly reached web stable in Chrome 148. Writer, Rewriter and Proofreader were still in developer or origin trial in the most recent docs I could find; I found no confirmation that they reached stable by Nov 2026. Hardware bar: more than 4 GB VRAM, or 16 GB RAM with 4+ cores, plus about 22 GB free disk. Desktop only.
- **Edge:** Ships the Writing Assistance APIs (Writer/Rewriter/Summarizer) on Phi-4-mini, with the new Aion-1.0-Instruct model in prerelease. Still labelled experimental/developer preview.
- **Firefox:** Offers only an experimental `browser.trial.ml` extension API, behind about:config flags on Release, limited to approved Hugging Face models.

### Cited Findings
- **Chrome built-in APIs page** (published 2024-08-27, last updated 2025-09-12, so it may be stale):
  - Summarizer, Translator and Language Detector: Chrome 138 stable, web and extensions.
  - Prompt API: Chrome 138 for extensions. The web row lists Chrome 148, plus a separate origin trial for sampling parameters. The page is internally inconsistent about this.
  - Writer and Rewriter: developer trial.
  - Proofreader: developer trial in the table, but "available in an origin trial" in the text.
  -- [Chrome: Built-in AI APIs](https://developer.chrome.com/docs/ai/built-in-apis)
- **Prompt API on web [secondary].** A Japanese report on Google I/O 2026 says the Prompt API became stable in Chrome 148. -- [Impress Watch](https://forest.watch.impress.co.jp/docs/news/2112093.html) [secondary]
- **Rewriter API docs (Japanese version, published 2025-10-22).** The origin trial runs Chrome 137 to 148. -- [Chrome Rewriter API (ja)](https://developer.chrome.com/docs/ai/rewriter-api?hl=ja)
- **Chrome requirements** (page last updated 2025-05-20):
  - OS: Windows 10/11, macOS 13+, Linux, or ChromeOS on Chromebook Plus.
  - Disk: about 22 GB free on the Chrome profile volume. The model is removed if free space drops below 10 GB.
  - Compute: GPU with more than 4 GB VRAM, or CPU with 16 GB RAM and 4+ cores.
  - Network: unmetered connection for the first download.
  - Mobile: not supported.
  - Model download: the first download requires user activation. Check status with `availability()`, which returns "unavailable", "downloadable", "downloading" or "available".
  - Extensions: "All of these APIs can be used in Chrome extensions." Extensions must register for any origin trial.
  - Data: after the download, no network is needed and no data goes to Google.
  -- [Chrome: Get started with built-in AI](https://developer.chrome.com/docs/ai/get-started)
- **Edge Writing Assistance APIs:**
  - They use Phi-4-mini by default.
  - From Edge 150.0.4070 they can use the prerelease Aion-1.0-Instruct model, which a flag can make the default.
  - Devices in the Medium or Low performance class are supported only through Aion.
  - Microsoft frames them as experimental/developer preview.
  -- [MS Learn: Writing Assistance APIs](https://learn.microsoft.com/microsoft-edge/web-platform/writing-assistance-apis); [Edge blog 2025-05-19](https://blogs.windows.com/msedgedev/2025/05/19/introducing-the-prompt-and-writing-assistance-apis/)
- **Edge blog, 2026-06-02:** "Expanding on-device AI in Microsoft Edge: New models and APIs for the web," which introduces Aion. -- linked from [MS Learn Phi Silica page](https://learn.microsoft.com/en-us/windows/ai/apis/phi-silica)
- **Firefox `browser.trial.ml`:**
  - Added in Firefox 134 and on by default in Nightly. On Beta and Release, users must flip two about:config prefs.
  - Requires the optional `trialML` permission.
  - Models are downloaded on first use and cached. Firefox will not let extensions download models outside Mozilla's model hub or allow-listed Hugging Face organizations.
  - "any API exposed on browser.trial may not be compatible across major versions."
  -- [Firefox source docs: WebExtensions AI API](https://firefox-source-docs.mozilla.org/toolkit/components/ml/extensions.html); [Mozilla blog: Running inference in web extensions](https://blog.mozilla.org/en/mozilla/ai/ai-tech/running-inference-in-web-extensions/)

### Inferences
- **Chrome is the strongest zero-key option for the extension.** The Prompt API, plus the Rewriter API if it reaches stable, covers rewrite, summarize and tidy at no cost, fully on-device and private. That suits a free tier or offline mode.
- **Quality is lower than frontier models.** Gemini Nano is a small model, so it will be noticeably weaker than cloud models for nuanced tone rewrites. I found no rewrite benchmarks.
- **Hardware will exclude many users.** The 22 GB disk and GPU/RAM bar will rule out a meaningful share of devices. The UI must handle `unavailable` and the download states.
- **Electron access is uncertain.** Gemini Nano is a Chrome feature. I found no evidence it is available inside Electron's Chromium, so the desktop app would need the OS-level options in Q3 instead.
- **Edge and Firefox add little.** Edge's APIs are a plausible add-on for Edge users, since Edge runs Chrome MV3 extensions, but they are experimental. Firefox's trial API is not suitable for a production feature.

### Gaps
- I could not get the current (Nov 2026) Chrome status table. The official page is dated Sept 2025, so I could not confirm whether Writer, Rewriter or Proofreader shipped to stable after their origin trials ended at Chrome 148.
- I found no published rewrite-quality comparison of Gemini Nano, Phi-4-mini or Aion against cloud models.
- I found no confirmation of whether Electron's bundled Chromium exposes the built-in AI APIs.

## Q3. OS-level: Windows AI APIs (Phi Silica, moving to Aion Instruct) and Apple Foundation Models from Electron

### Takeaway
- **Windows:** Microsoft officially supports calling Phi Silica from Electron through a native Node addon (the `winapp` CLI with a C# or C++ template). There is a built-in Rewrite skill. Requirements:
  - package identity (sparse package or MSIX) plus the `systemAIModels` capability;
  - a Limited Access Feature token for Phi Silica (not needed for its successor, Aion Instruct);
  - a Copilot+ NPU, or a high-end GPU on Insider builds.

  Phi Silica is being replaced by Aion Instruct, rolling out to retail devices in January 2027.
- **macOS:** Apple's Foundation Models framework is Swift-only and requires Apple Intelligence. From Electron it is reachable only through community wrappers or a custom Swift/N-API bridge. WWDC26 added a pluggable "Language Model protocol" that also covers Claude and Gemini, plus Private Cloud Compute access for smaller apps.

### Cited Findings
- **MS Learn guide "Creating a Phi Silica Addon" (updated 2026-11-09):**
  - Run `npx winapp node create-addon --template cs`. This uses node-api-dotnet, compiles with Native AOT to a `.node` file, and needs no .NET runtime on target machines.
  - Call it from the Electron main process, then expose it to the renderer via preload/IPC.
  - Declare `<systemai:Capability Name="systemAIModels"/>` and set MaxVersionTested to 10.0.26226.0 or later.
  - Run `npx winapp node add-electron-debug-identity` for a temporary identity during development.
  - Known issue: a Windows bug with sparse-packaged Electron apps can cause crashes or a blank window.
  -- [MS Learn: Electron Phi Silica addon](https://learn.microsoft.com/en-us/windows/apps/dev-tools/winapp-cli/guides/electron-phi-silica-addon)
- **Phi Silica page (ms.date 2026-10-16, updated 2026-11-16):**
  - "The Phi Silica APIs are part of a Limited Access Feature," with an unlock token requested by form.
  - "Phi Silica is being replaced by Aion Instruct ... Unlike Phi Silica, LAF tokens are no longer needed with Aion Instruct." Aion reaches Insiders in December 2026 and retail in January 2027, when Phi Silica is removed.
  - Hardware: Copilot+ NPU (preinstalled), NVIDIA RTX 30+ with 6+ GB VRAM, or AMD RX 9060+ with 6+ GB VRAM.
  - The GPU path needs Developer Mode, Insider Experimental build 26300.8553+, Windows App SDK 2.2.2-experimental9+, and the latest IHV driver. The GPU model is a multi-GB download via Windows Update.
  - Not available in China.
  - Text Intelligence Skills include "Rewrite: Rephrases the prompt text to optimize clarity, readability, and, when specified, tone."
  - Since October 2026 some text API output carries an invisible AI watermark.
  - Content moderation options are built in.
  -- [MS Learn: Phi Silica](https://learn.microsoft.com/en-us/windows/ai/apis/phi-silica)
- **Prebuilt npm addon and no-build option.** Microsoft publishes `@microsoft/windows-ai-electron`, an addon for calling Windows AI APIs from JS; `EnsureReadyAsync` fails on non-Copilot+ or non-Windows devices. A Feb 2026 devblog describes "dynamic API projections for Node.js" that reach LanguageModel/TextSummarizer without a native build step. -- [Windows devblog 2026-02-23](https://devblogs.microsoft.com/ifdef-windows/use-windows-on-device-ai-in-your-electron-app/); [Dynamic API projections devblog](https://devblogs.microsoft.com/ifdef-windows/a-new-way-to-bring-native-windows-apis-to-javascript-introducing-dynamic-api-projections-for-node-js/)
- **Apple WWDC26 ML guide:**
  - "The Foundation Models framework is a native Swift API that gives you direct access to the same on-device model that powers Apple Intelligence."
  - "You can now work with any language model, including Apple Foundation Models, cloud models like Claude and Gemini, or any other provider that conforms to the Language Model protocol."
  - "If your app has fewer than 2 million total first-time App Store downloads, you can access the latest Apple Foundation Model on Private Cloud Compute."
  - A session covers an "fm CLI and Python SDK."
  -- [Apple WWDC26 ML guide](https://developer.apple.com/wwdc26/guides/machine-learning/)
- **Community Node wrappers [secondary; npm listings]:**
  - `apple-local-llm` (macOS 26, Apple Silicon): works in the Electron main process via a native helper binary over stdio, with an HTTP mode for the renderer.
  - `tsfm`: prebuilt dylib, macOS 26+.
  - `apple-foundation-models`: Swift helper.
  - The model must be enabled in System Settings (Apple Intelligence).
  -- [socket.dev apple-local-llm](https://socket.dev/npm/package/apple-local-llm); [socket.dev apple-foundation-models](https://socket.dev/npm/package/apple-foundation-models)

### Inferences
- **Windows is feasible but costly.** Integration means adding a .NET/C++ addon build step to the Electron build, sparse-package identity, the systemAIModels capability, and (until January 2027) a LAF token. Thought Tidy is Windows-first, so this is the most "official" zero-key path for desktop. It reaches only Copilot+ PCs and some high-end GPU PCs, which is a minority of users.
- **Build against Aion, not Phi Silica.** Phi Silica is removed in January 2027, so new work should target the Aion Instruct transition, which also drops the LAF requirement.
- **macOS is possible through a small Swift sidecar or a community wrapper.** The Private Cloud Compute eligibility statement is tied to App Store downloads, so it is unclear whether a non-App-Store Electron app qualifies.
- **This is not "use the user's paid AI".** The OS options give a free on-device small model, not the user's ChatGPT or Claude subscription. Expect quality similar to Gemini Nano: fine for light tidy and summarize, weaker for nuanced rewrites.

### Gaps
- No primary Apple doc gives the macOS version or hardware minimums, or says whether non-Swift or non-App-Store apps can use the Language Model protocol or Private Cloud Compute.
- No Aion Instruct quality data was found.
- I could not confirm whether the `@microsoft/windows-ai-electron` package is GA or still in preview.

## Q4. MCP sampling: can Thought Tidy act as an MCP server and borrow the client's model?

### Takeaway
- **Impractical, and now deprecated.**
  - The MCP 2026-07-28 spec officially deprecates Sampling (SEP-2577), recommends "integrate directly with LLM provider APIs instead," and replaces server-initiated `sampling/createMessage` with the Multi Round-Trip Request pattern.
  - Client support was always thin. VS Code is the only major client commonly reported as supporting it. Claude Desktop's status is disputed, and I found no evidence for ChatGPT or Cursor.
  - It also does not fit a hotkey writing tool, because the MCP client (chat app or IDE) must be running and in control.

### Cited Findings
- **MCP 2026-07-28 changelog, "Deprecated" section:** "Deprecate the Roots, Sampling, and Logging features (SEP-2577). These features remain fully functional during the deprecation window but new implementations should not add support for them. Suggested migrations: ... integrate directly with LLM provider APIs instead of Sampling."
  - New policy: a minimum 12-month deprecation window.
  - The same revision makes the protocol stateless and introduces MRTR, which "replaces the previous approach of sending server-initiated requests, such as ... `sampling/createMessage`."
  -- [MCP spec 2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog.md)
- **Removal date [secondary].** Third-party guides say Sampling can be removed in the first spec revision on or after 2026-07-28 plus one year, i.e. 2027-07-28. -- [ecorpit](https://ecorpit.com/mcp-sampling-roots-logging-deprecation-2027/) [secondary]; [noze.it](https://www.noze.it/en/insights/mcp-2026-07-28-stateless/) [secondary]
- **Client support (secondary sources conflict):**
  - One source says VS Code is the only standard client implementing sampling.
  - Another claims Claude Desktop is the only major client that supports it.
  - The Vercel AI SDK community "mcp-sampling" provider page lists Claude Desktop as "Tracking (Issue #1785)", meaning not supported.
  - I found no source saying ChatGPT supports sampling.
  -- [AI SDK mcp-sampling provider](https://ai-sdk.dev/providers/community-providers/mcp-sampling); [DevelopersDigest: MCP client features 2026](https://www.developersdigest.tech/blog/mcp-client-features-explained-2026) [secondary]; [blckalpaca MCP clients 2026](https://blckalpaca.at/en/knowledge-base/ai-agents/model-context-protocol-mcp/mcp-clients-in-2026-claude-desktop-cursor-zed-cline-vs-code-and-custom-compared) [secondary]
- **Official client matrix unavailable.** The modelcontextprotocol.io client list page could not be retrieved (it redirects to the intro page or returns 404), so the official feature matrix could not be checked. -- [modelcontextprotocol.io](https://modelcontextprotocol.io/clients)

### Inferences
- **MCP sampling is not viable for Thought Tidy:**
  - It is deprecated, so new implementations "should not add support."
  - Few clients support it.
  - Even where it works, the user must have the MCP host open, and the host usually shows a human-approval prompt for each sampling request. That breaks a select-text-and-press-hotkey flow.
  - Billing and ToS would follow the host app's subscription, so it would effectively be an unsupported way to borrow a chat subscription.
- **Better MCP role.** Thought Tidy could ship as an MCP server exposing "tidy/rewrite" tools for users who are already working inside Claude/ChatGPT/VS Code. The host model then does the work in the host app. That is a distribution channel, not a way to power Thought Tidy's own hotkey UI.

### Gaps
- No authoritative, current (Nov 2026) per-client sampling matrix was retrieved.
- Claude Desktop, ChatGPT and Cursor sampling status is unverified on a primary source.

## Q5. GitHub Models / GitHub Copilot: GitHub sign-in to use the user's Copilot subscription or GitHub Models free tier

### Takeaway
- **GitHub Models is gone.** It was fully retired on 2026-07-30: inference API, playground and BYOK are no longer available to anyone. Thought Tidy's current "GitHub Models" provider is dead and should be removed.
- **The Copilot SDK is the sanctioned replacement.** A third-party app can register a GitHub OAuth App or GitHub App, sign users in, and pass their user token (`gho_`/`ghu_`) to the SDK.
  - Usage "is billed to each user's subscription."
  - Each user needs an active Copilot subscription and is subject to their own Copilot rate limits.
- **Reusing Copilot tokens outside the SDK is not supported.** Scraping or reusing Copilot's internal tokens via undocumented endpoints is not an officially documented public API.

### Cited Findings
- **GitHub Models retirement timeline:**
  - 2026-06-16: no longer available to new orgs or enterprises without prior usage.
  - 2026-07-01: full retirement announced for 2026-07-30, with brownouts on 2026-07-16 and 2026-07-23.
  - 2026-07-30: "the playground, model catalog, inference API, and bring your own key (BYOK) are no longer available to any customer," including existing customers.
  -- [GitHub changelog 2026-07-01](https://github.blog/changelog/2026-07-01-github-models-is-being-fully-retired-on-july-30-2026); [GitHub changelog 2026-07-30](https://github.blog/changelog/2026-07-30-github-models-is-now-retired/); [GitHub changelog 2026-06-16](https://github.blog/changelog/2026-06-16-github-models-is-no-longer-available-to-new-customers)
- **Current GitHub Models docs page:** "GitHub Models has been retired." It "was a separate service from GitHub Copilot." It points users to Azure AI Foundry for a model catalog, or to GitHub Copilot. -- [GitHub Docs: GitHub Models](https://docs.github.com/en/github-models/use-github-models/prototyping-with-ai-models)
- **Copilot SDK GitHub OAuth setup:**
  - Standard authorization-code web flow (not device flow), with a callback and a server-side code exchange. GitHub Apps are recommended for new projects.
  - "Copilot usage is billed to each user's subscription."
  - "Each user needs an active Copilot subscription."
  - Requests are "Subject to each user's Copilot rate limits."
  - "Your application is responsible for token storage, refresh, and expiration handling."
  - Supported tokens: `gho_`, `ghu_`, and fine-grained `github_pat_`. Classic `ghp_` tokens are deprecated and unsupported.
  - Listed use cases include "SaaS products" and "multi-user apps."
  - It mentions an "external CLI server" and `useLoggedInUser: false` to avoid falling back to "CLI login."
  - Users without GitHub accounts are pointed to BYOK.
  -- [GitHub Docs: Copilot SDK GitHub OAuth](https://docs.github.com/en/copilot/how-tos/copilot-sdk/setup/github-oauth); [GitHub Docs: Copilot SDK auth methods](https://docs.github.com/en/copilot/how-tos/copilot-sdk/auth/authenticate)
- **Copilot SDK repo.** The README describes these as "GitHub Copilot CLI SDKs," implying the SDK drives a Copilot CLI runtime. -- [github/copilot-sdk README](https://cdn.jsdelivr.net/gh/github/copilot-sdk@main/README.md)
- **Copilot terms [secondary].** One third-party analysis says the older GitHub Copilot Product Terms were deprecated on 2026-03-05. I did not verify the current governing terms on github.com. -- [ConductAtlas](https://conductatlas.com/platform/github/github-copilot-product-terms/) [secondary]

### Inferences
- **Electron:** the Copilot SDK is a realistic "use the AI the user already pays for" option, explicitly sanctioned and billed to the user. The OAuth code exchange needs a client secret, which a source-available app cannot embed safely. Options are a small backend for the exchange, or a GitHub App flow that does not require a secret. Device flow is not documented for the SDK, and it is unclear whether it would work.
- **Browser extension:** the SDK appears to rely on a CLI runtime process, so it is likely unusable directly from an MV3 extension. It could be reached through the Electron app or a native-messaging host.
- **Copilot quality:** Copilot exposes several frontier models, which is good for rewriting. It counts against the user's Copilot premium-request allowance, and Copilot is marketed as a coding product, so non-coding writing use under a user's Copilot plan is a ToS gray area to confirm. The SDK docs list SaaS and multi-user apps without restricting the domain.
- **Paid features:** charging for Pro features in an app that consumes users' Copilot quota does not appear prohibited in the SDK docs reviewed. The current Copilot product terms should be checked before launch.

### Gaps
- No primary statement was found on whether the Copilot SDK may be used for non-coding apps such as a writing assistant, or on reselling and value-added paid apps.
- Not confirmed:
  - whether device flow works with the SDK;
  - which runtime the SDK requires (Node plus Copilot CLI binary?);
  - GA vs. preview status;
  - whether Copilot Free users can use the SDK and with what limits.
- The current Copilot product terms text (post March 2026) was not retrieved.
