// Tests for lib/pricing.js — token estimation and cost formatting

const { MODEL_PRICING, tokensFrom, estimateCost, formatCost } = require("../lib/pricing");

describe("MODEL_PRICING", () => {
  test("is a non-empty array", () => {
    expect(Array.isArray(MODEL_PRICING)).toBe(true);
    expect(MODEL_PRICING.length).toBeGreaterThan(0);
  });

  test("each entry has match, in, and out fields", () => {
    for (const row of MODEL_PRICING) {
      expect(typeof row.match).toBe("string");
      expect(typeof row.in).toBe("number");
      expect(typeof row.out).toBe("number");
    }
  });
});

describe("tokensFrom", () => {
  test("estimates tokens as ceil(length / 4)", () => {
    expect(tokensFrom("abcd")).toBe(1);   // 4 / 4 = 1
    expect(tokensFrom("abcde")).toBe(2);  // 5 / 4 = 1.25 → 2
    expect(tokensFrom("")).toBe(0);
  });

  test("handles null/undefined gracefully", () => {
    expect(tokensFrom(null)).toBe(0);
    expect(tokensFrom(undefined)).toBe(0);
  });
});

describe("estimateCost", () => {
  test("returns correct token counts and cost for a known model", () => {
    // gpt-4o-mini: $0.15/M in, $0.60/M out
    // 40 chars input → 10 tokens; 40 chars output → 10 tokens
    const input  = "a".repeat(40);  // 40 chars → 10 tokens
    const output = "b".repeat(40);  // 40 chars → 10 tokens
    const { inputTokens, outputTokens, costUSD } = estimateCost("gpt-4o-mini", input, output);
    expect(inputTokens).toBe(10);
    expect(outputTokens).toBe(10);
    expect(costUSD).toBeCloseTo((10 * 0.15 + 10 * 0.60) / 1_000_000, 10);
  });

  test("returns costUSD: null for an unknown model", () => {
    const { costUSD } = estimateCost("mystery-model-9000", "hello", "world");
    expect(costUSD).toBeNull();
  });

  test("accepts an array of output texts", () => {
    const { outputTokens } = estimateCost("gpt-4o-mini", "hi", ["aaaa", "bbbb"]);
    expect(outputTokens).toBe(2); // 4+4 = 8 chars → 2 tokens
  });

  test("handles empty outputTexts", () => {
    const { outputTokens, costUSD } = estimateCost("gpt-4o-mini", "hello", []);
    expect(outputTokens).toBe(0);
    expect(costUSD).toBeGreaterThanOrEqual(0);
  });

  test("matches gpt-4o-mini before gpt-4o (order matters)", () => {
    const { costUSD: miniCost } = estimateCost("gpt-4o-mini", "a".repeat(4), "");
    const { costUSD: fullCost } = estimateCost("gpt-4o",      "a".repeat(4), "");
    expect(miniCost).toBeLessThan(fullCost);
  });

  test("matches claude haiku", () => {
    const { costUSD } = estimateCost("claude-haiku-4-5", "test", "result");
    expect(costUSD).not.toBeNull();
  });

  test("matches gemini models", () => {
    const { costUSD } = estimateCost("gemini-2.0-flash", "test", "result");
    expect(costUSD).not.toBeNull();
  });
});

describe("formatCost", () => {
  test("returns — for null", () => {
    expect(formatCost(null)).toBe("—");
  });

  test("returns — for undefined", () => {
    expect(formatCost(undefined)).toBe("—");
  });

  test("returns $0.00 for zero", () => {
    expect(formatCost(0)).toBe("$0.00");
  });

  test("returns < $0.000001 for sub-microdollar amounts", () => {
    expect(formatCost(0.0000005)).toBe("< $0.000001");
  });

  test("returns 6-decimal format for sub-cent amounts", () => {
    const formatted = formatCost(0.0005);
    expect(formatted).toMatch(/^\$0\.\d{6}$/);
  });

  test("returns 4-decimal format for amounts under $0.10", () => {
    const formatted = formatCost(0.05);
    expect(formatted).toMatch(/^\$0\.\d{4}$/);
  });

  test("returns 2-decimal format for larger amounts", () => {
    expect(formatCost(1.5)).toBe("$1.50");
    expect(formatCost(0.10)).toBe("$0.10");
  });
});
