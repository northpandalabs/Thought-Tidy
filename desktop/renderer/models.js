// Model list fetchers, testers, and cost-tier helper for each AI provider
// Used by the options page to populate model dropdowns

// Returns "$" (low), "$$" (medium), or "$$$" (high) for a given model ID.
// Pattern-matched so it survives new model releases without a code change.
function costTier(modelId) {
  const id = modelId.toLowerCase();
  if (/haiku|flash(-lite)?$|gpt-4o-mini|o[34]-mini|gemini-2\.0-flash/.test(id)) return "$";
  if (/opus|o1(?!-mini)|o3(?!-mini)|o4(?!-mini)|gpt-4-(?!turbo)|gpt-4\.5/.test(id))  return "$$$";
  return "$$"; // sonnet, gpt-4o, o1-mini, 1.5-pro, etc.
}

async function fetchOpenAIModels(apiKey) {
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { "Authorization": `Bearer ${apiKey}` }
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || res.statusText); }
  const data = await res.json();
  return data.data
    .filter(m => /^(gpt-|o\d|chatgpt)/.test(m.id) &&
                 !/(audio|realtime|instruct|search|tts|whisper|dall|embed|vision-preview)/.test(m.id))
    .sort((a, b) => b.created - a.created)
    .map(m => ({ id: m.id, label: m.id }));
}

async function fetchClaudeModels(apiKey) {
  const res = await fetch("https://api.anthropic.com/v1/models", {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    }
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || res.statusText); }
  const data = await res.json();
  return (data.data || []).map(m => ({ id: m.id, label: m.display_name || m.id }));
}

async function fetchGeminiModels(apiKey) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
  );
  if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || res.statusText); }
  const data = await res.json();
  return (data.models || [])
    .filter(m => m.supportedGenerationMethods?.includes("generateContent"))
    .map(m => ({
      id:    m.name.replace(/^models\//, ""),
      label: m.displayName || m.name.replace(/^models\//, "")
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

async function testOpenAI(apiKey, modelId) {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ model: modelId, messages: [{ role: "user", content: "This is a test" }], max_tokens: 5 })
    });
    return res.ok;
  } catch { return false; }
}

async function testClaude(apiKey, modelId) {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({ model: modelId, max_tokens: 5, messages: [{ role: "user", content: "This is a test" }] })
    });
    return res.ok;
  } catch { return false; }
}

async function testGemini(apiKey, modelId) {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "This is a test" }] }],
          generationConfig: { maxOutputTokens: 5 }
        })
      }
    );
    return res.ok;
  } catch { return false; }
}

if (typeof module !== "undefined") {
  module.exports = {
    fetchOpenAIModels, fetchClaudeModels, fetchGeminiModels,
    testOpenAI, testClaude, testGemini,
    costTier
  };
}
