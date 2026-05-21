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

if (typeof module !== "undefined") {
  module.exports = { callOpenAI, callClaude, callGemini, callAI };
}
