// AI provider API callers — depend only on the global fetch (browser or Node 18+)

async function callOpenAI(apiKey, model, prompt, text) {
  if (!apiKey) throw new Error("OpenAI API key not set — open Settings.");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: prompt },
        { role: "user",   content: text }
      ],
      temperature: 0.7
    })
  });
  if (!res.ok) {
    const e = await res.json();
    throw new Error(`OpenAI: ${e.error?.message || res.statusText}`);
  }
  return (await res.json()).choices[0].message.content.trim();
}

async function callClaude(apiKey, model, prompt, text) {
  if (!apiKey) throw new Error("Claude API key not set — open Settings.");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: prompt,
      messages: [{ role: "user", content: text }]
    })
  });
  if (!res.ok) {
    const e = await res.json();
    throw new Error(`Claude: ${e.error?.message || res.statusText}`);
  }
  return (await res.json()).content[0].text.trim();
}

async function callGemini(apiKey, model, prompt, text) {
  if (!apiKey) throw new Error("Gemini API key not set — open Settings.");
  const modelId = model.replace(/^models\//, ""); // strip prefix returned by ListModels
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `${prompt}\n\n${text}` }] }],
        generationConfig: { temperature: 0.7 }
      })
    }
  );
  if (!res.ok) {
    const e = await res.json();
    throw new Error(`Gemini: ${e.error?.message || res.statusText}`);
  }
  return (await res.json()).candidates[0].content.parts[0].text.trim();
}

async function callAI(provider, settings, prompt, text) {
  switch (provider) {
    case "openai": return callOpenAI(settings.openaiKey, settings.openaiModel || "gpt-4o-mini",              prompt, text);
    case "claude": return callClaude(settings.claudeKey, settings.claudeModel || "claude-haiku-4-5-20251001", prompt, text);
    case "gemini": return callGemini(settings.geminiKey, settings.geminiModel || "gemini-2.0-flash",           prompt, text);
    default: throw new Error(`Unknown provider "${provider}". Open Settings to choose one.`);
  }
}

// Returns true when the error is likely transient and the next provider/model should be tried.
function isRetriable(errMsg) {
  return /rate.limi|429|503|overload|quota|unavailable|exhausted|temporar/i.test(errMsg || "");
}

const _PROVIDER_LABELS = { openai: "OpenAI", claude: "Claude", gemini: "Gemini" };

// Builds a minimal configuredProviders list from the legacy flat storage keys.
// Used as a migration shim in callers that haven't run the full settings migration yet.
function _buildFromOldKeys(s) {
  const map = {
    openai: { apiKey: s.openaiKey, model: s.openaiModel || "gpt-4o-mini" },
    claude: { apiKey: s.claudeKey, model: s.claudeModel || "claude-haiku-4-5-20251001" },
    gemini: { apiKey: s.geminiKey, model: s.geminiModel || "gemini-2.0-flash" }
  };
  const active = s.provider || "openai";
  const order  = [active, ...["openai", "claude", "gemini"].filter(p => p !== active)];
  return order.filter(id => map[id]?.apiKey).map(id => ({ id, ...map[id] }));
}

// Priority-based dispatch across configuredProviders.
// Falls back to legacy flat keys when configuredProviders is absent (migration shim).
// Returns { result, usedProvider, usedModel }.
async function callAIWithFallback(configuredProviders, geminiModels, settings, prompt, text, { onStatusUpdate } = {}) {
  const providers = (Array.isArray(configuredProviders) && configuredProviders.length)
    ? configuredProviders
    : _buildFromOldKeys(settings || {});

  if (!providers.length) {
    throw new Error("No AI providers configured — open Settings to add one.");
  }

  const notify = typeof onStatusUpdate === "function" ? onStatusUpdate : () => {};
  let lastError = null;

  for (const p of providers) {
    const label = _PROVIDER_LABELS[p.id] || p.id;

    if (p.id === "gemini") {
      const slots  = Array.isArray(geminiModels) ? geminiModels.filter(Boolean) : [];
      const models = slots.length ? slots : [p.model || "gemini-2.0-flash"];
      for (const model of models) {
        notify(`Trying ${label} (${model})…`);
        try {
          const result = await callGemini(p.apiKey, model, prompt, text);
          return { result, usedProvider: "gemini", usedModel: model };
        } catch (err) {
          lastError = err;
          if (!isRetriable(err.message)) throw err;
        }
      }

    } else if (p.id === "openai") {
      const model = p.model || "gpt-4o-mini";
      notify(`Trying ${label}…`);
      try {
        const result = await callOpenAI(p.apiKey, model, prompt, text);
        return { result, usedProvider: "openai", usedModel: model };
      } catch (err) {
        lastError = err;
        if (!isRetriable(err.message)) throw err;
      }

    } else if (p.id === "claude") {
      const model = p.model || "claude-haiku-4-5-20251001";
      notify(`Trying ${label}…`);
      try {
        const result = await callClaude(p.apiKey, model, prompt, text);
        return { result, usedProvider: "claude", usedModel: model };
      } catch (err) {
        lastError = err;
        if (!isRetriable(err.message)) throw err;
      }
    }
  }

  throw lastError || new Error("All providers exhausted — check your API keys.");
}

if (typeof module !== "undefined") {
  module.exports = { callOpenAI, callClaude, callGemini, callAI, callAIWithFallback, isRetriable };
}
