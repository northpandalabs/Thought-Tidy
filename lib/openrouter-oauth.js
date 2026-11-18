// OpenRouter OAuth PKCE — "Sign in with OpenRouter"
// https://openrouter.ai/docs/guides/overview/auth/oauth
// No client registration or secret: the user authorizes on openrouter.ai, we get back a
// one-time code, and exchange it (with our PKCE verifier) for a regular OpenRouter API key.
// Depends only on globalThis.crypto + fetch, so it runs in extension pages and in Node 18+.

const OPENROUTER_AUTH_URL     = "https://openrouter.ai/auth";
const OPENROUTER_EXCHANGE_URL = "https://openrouter.ai/api/v1/auth/keys";
const OPENROUTER_KEY_LABEL    = "Thought Tidy";

function _b64url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Returns { verifier, challenge, state }. A fresh set is required for every sign-in attempt.
async function createOpenRouterPkce() {
  const verifier  = _b64url(globalThis.crypto.getRandomValues(new Uint8Array(32)));
  const digest    = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = _b64url(new Uint8Array(digest));
  const state     = _b64url(globalThis.crypto.getRandomValues(new Uint8Array(16)));
  return { verifier, challenge, state };
}

function buildOpenRouterAuthUrl(callbackUrl, challenge, state) {
  const u = new URL(OPENROUTER_AUTH_URL);
  u.searchParams.set("callback_url", callbackUrl);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("key_label", OPENROUTER_KEY_LABEL);
  if (state) u.searchParams.set("state", state);
  return u.toString();
}

// Pulls the authorization code out of the redirect URL and checks state.
function parseOpenRouterCallback(redirectedTo, expectedState) {
  let u;
  try { u = new URL(redirectedTo); } catch { throw new Error("OpenRouter sign-in returned an invalid redirect."); }
  const err = u.searchParams.get("error");
  if (err) throw new Error(err === "access_denied" ? "OpenRouter sign-in was cancelled." : `OpenRouter sign-in failed: ${err}`);
  const code = u.searchParams.get("code");
  if (!code) throw new Error("OpenRouter sign-in was cancelled.");
  if (expectedState && u.searchParams.get("state") !== expectedState)
    throw new Error("OpenRouter sign-in failed: state mismatch. Try again.");
  return code;
}

async function exchangeOpenRouterCode(code, verifier) {
  const res = await fetch(OPENROUTER_EXCHANGE_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ code, code_verifier: verifier, code_challenge_method: "S256" })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error?.message || data.message || res.statusText;
    throw new Error(`OpenRouter sign-in failed: ${msg}`);
  }
  if (typeof data.key !== "string" || !data.key) throw new Error("OpenRouter sign-in failed: no key returned.");
  return data.key;
}

if (typeof module !== "undefined") {
  module.exports = { createOpenRouterPkce, buildOpenRouterAuthUrl, parseOpenRouterCallback, exchangeOpenRouterCode, OPENROUTER_AUTH_URL, OPENROUTER_EXCHANGE_URL };
}
