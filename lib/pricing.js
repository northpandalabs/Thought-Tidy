'use strict';
/* Token/cost estimation for all supported models.
   Order matters — match most-specific substrings first. */
const MODEL_PRICING = [
  // OpenAI
  { match: "gpt-4o-mini",      in: 0.15,   out: 0.60  },
  { match: "gpt-4o",           in: 2.50,   out: 10.00 },
  { match: "gpt-4-turbo",      in: 10.00,  out: 30.00 },
  { match: "gpt-4",            in: 30.00,  out: 60.00 },
  { match: "gpt-3.5",          in: 0.50,   out: 1.50  },
  { match: "o3-mini",          in: 1.10,   out: 4.40  },
  { match: "o1-mini",          in: 3.00,   out: 12.00 },
  { match: "o1",               in: 15.00,  out: 60.00 },
  { match: "o3",               in: 10.00,  out: 40.00 },
  // Anthropic
  { match: "claude-haiku-4",   in: 0.80,   out: 4.00  },
  { match: "claude-haiku-3",   in: 0.25,   out: 1.25  },
  { match: "claude-sonnet-4",  in: 3.00,   out: 15.00 },
  { match: "claude-sonnet-3",  in: 3.00,   out: 15.00 },
  { match: "claude-opus-4",    in: 15.00,  out: 75.00 },
  { match: "claude-opus-3",    in: 15.00,  out: 75.00 },
  // Google Gemini
  { match: "gemini-2.0-flash", in: 0.10,   out: 0.40  },
  { match: "gemini-1.5-flash", in: 0.075,  out: 0.30  },
  { match: "gemini-1.5-pro",   in: 1.25,   out: 5.00  },
  { match: "gemini-pro",       in: 0.50,   out: 1.50  },
];

function tokensFrom(text) {
  return Math.ceil((text || "").length / 4);
}

function estimateCost(model, inputText, outputTexts) {
  const inToks = tokensFrom(inputText);
  const outArr = Array.isArray(outputTexts) ? outputTexts : (outputTexts ? [outputTexts] : []);
  const outToks = outArr.reduce((s, t) => s + tokensFrom(t), 0);

  const row = MODEL_PRICING.find(p => (model || "").toLowerCase().includes(p.match));
  const costUSD = row ? (inToks * row.in + outToks * row.out) / 1_000_000 : null;

  return { inputTokens: inToks, outputTokens: outToks, costUSD };
}

function formatCost(costUSD) {
  if (costUSD === null || costUSD === undefined) return "—";
  if (costUSD === 0)       return "$0.00";
  if (costUSD < 0.000001)  return "< $0.000001";
  if (costUSD < 0.001)     return `$${costUSD.toFixed(6)}`;
  if (costUSD < 0.10)      return `$${costUSD.toFixed(4)}`;
  return `$${costUSD.toFixed(2)}`;
}

if (typeof module !== "undefined") {
  module.exports = { MODEL_PRICING, tokensFrom, estimateCost, formatCost };
}
