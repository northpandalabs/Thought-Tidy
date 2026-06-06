// Tests for buildGrammarInstructions in lib/prompts.js

const { buildGrammarInstructions } = require("../lib/prompts");

describe("buildGrammarInstructions", () => {
  test("returns empty string for empty object", () => {
    expect(buildGrammarInstructions({})).toBe("");
  });

  test("returns empty string for null", () => {
    expect(buildGrammarInstructions(null)).toBe("");
  });

  test("returns empty string for undefined", () => {
    expect(buildGrammarInstructions(undefined)).toBe("");
  });

  test("emDash enabled + mode dont_add includes 'Do not use em dashes'", () => {
    const result = buildGrammarInstructions({ emDash: { enabled: true, mode: "dont_add" } });
    expect(result).toMatch(/Do not use em dashes/i);
    expect(result).not.toMatch(/Replace/i);
  });

  test("emDash enabled + mode replace includes 'Replace any em dash'", () => {
    const result = buildGrammarInstructions({ emDash: { enabled: true, mode: "replace" } });
    expect(result).toMatch(/Replace any em dash/i);
    expect(result).not.toMatch(/Do not use em dashes/i);
  });

  test("noHeadings=true includes heading instruction", () => {
    const result = buildGrammarInstructions({ noHeadings: true });
    expect(result).toMatch(/heading/i);
  });

  test("noFillerOpeners=true includes filler instruction", () => {
    const result = buildGrammarInstructions({ noFillerOpeners: true });
    expect(result).toMatch(/filler/i);
  });

  test("noFormalSignoffs=true includes sign-off instruction", () => {
    const result = buildGrammarInstructions({ noFormalSignoffs: true });
    expect(result).toMatch(/sign.off|I hope this helps/i);
  });

  test("all enabled returns block with all four lines", () => {
    const result = buildGrammarInstructions({
      emDash:          { enabled: true, mode: "dont_add" },
      noHeadings:      true,
      noFillerOpeners: true,
      noFormalSignoffs: true
    });
    expect(result).toMatch(/Do not use em dashes/i);
    expect(result).toMatch(/heading/i);
    expect(result).toMatch(/filler/i);
    expect(result).toMatch(/sign.off|I hope this helps/i);
    const lineCount = result.split("\n").filter(l => l.startsWith("- ")).length;
    expect(lineCount).toBe(4);
  });

  test("emDash enabled but no mode defaults gracefully (does not throw)", () => {
    expect(() => buildGrammarInstructions({ emDash: { enabled: true } })).not.toThrow();
    const result = buildGrammarInstructions({ emDash: { enabled: true } });
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  test("emDash disabled does not add em dash instruction", () => {
    const result = buildGrammarInstructions({ emDash: { enabled: false, mode: "replace" } });
    expect(result).toBe("");
  });
});
