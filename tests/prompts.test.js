const { MENU_PROMPTS, buildPromptWithProfile } = require("../lib/prompts");

// ── MENU_PROMPTS ──────────────────────────────────────────────────────────────

describe("MENU_PROMPTS", () => {
  const EXPECTED_KEYS = [
    "fix-spelling", "sound-like-me", "professional", "sound-human",
    "brain-dump", "improve", "formal", "casual", "shorten", "expand"
  ];

  test("contains all expected menu item keys", () => {
    EXPECTED_KEYS.forEach(key => {
      expect(MENU_PROMPTS).toHaveProperty(key);
    });
  });

  test("every prompt is a non-empty string", () => {
    Object.entries(MENU_PROMPTS).forEach(([key, prompt]) => {
      expect(typeof prompt).toBe("string");
      expect(prompt.length).toBeGreaterThan(10);
    });
  });

  test("every prompt ends with a colon (instruction separator convention)", () => {
    Object.entries(MENU_PROMPTS).forEach(([key, prompt]) => {
      expect(prompt.trimEnd()).toMatch(/:$/);
    });
  });

  test("every prompt contains 'Return ONLY' (prevents AI from adding commentary)", () => {
    Object.entries(MENU_PROMPTS).forEach(([key, prompt]) => {
      expect(prompt).toContain("Return ONLY");
    });
  });

  test("sound-like-me prompt references authenticity to the person", () => {
    expect(MENU_PROMPTS["sound-like-me"]).toContain("voice");
  });

  test("brain-dump prompt mentions not losing information", () => {
    const p = MENU_PROMPTS["brain-dump"].toLowerCase();
    expect(p).toMatch(/lose|losing|lost/);
  });
});

// ── buildPromptWithProfile ────────────────────────────────────────────────────

describe("buildPromptWithProfile", () => {
  const BASE = "Fix spelling errors. Return ONLY the corrected text:";

  test("returns base prompt unchanged when profileEnabled is false", () => {
    expect(buildPromptWithProfile(BASE, { profileEnabled: false, profileName: "Bailey" })).toBe(BASE);
  });

  test("returns base prompt unchanged when profileEnabled is missing", () => {
    expect(buildPromptWithProfile(BASE, { profileName: "Bailey" })).toBe(BASE);
  });

  test("returns base prompt unchanged when settings is null", () => {
    expect(buildPromptWithProfile(BASE, null)).toBe(BASE);
  });

  test("returns base prompt unchanged when profileEnabled is true but all fields empty", () => {
    expect(buildPromptWithProfile(BASE, { profileEnabled: true })).toBe(BASE);
  });

  test("injects name when profileEnabled and name is set", () => {
    const result = buildPromptWithProfile(BASE, { profileEnabled: true, profileName: "Bailey" });
    expect(result).toContain("Bailey");
    expect(result).toContain(BASE);
  });

  test("injects role when provided", () => {
    const result = buildPromptWithProfile(BASE, { profileEnabled: true, profileRole: "Roofer" });
    expect(result).toContain("Roofer");
  });

  test("injects writing style when provided", () => {
    const result = buildPromptWithProfile(BASE, { profileEnabled: true, profileStyle: "Short sentences" });
    expect(result).toContain("Short sentences");
  });

  test("injects personal context when provided", () => {
    const ctx = "Runs a roofing company in Texas";
    const result = buildPromptWithProfile(BASE, { profileEnabled: true, profileContext: ctx });
    expect(result).toContain(ctx);
  });

  test("includes all four profile fields when all are set", () => {
    const s = {
      profileEnabled: true,
      profileName: "Bailey",
      profileRole: "Developer",
      profileStyle: "Casual, em-dashes",
      profileContext: "Builds Firefox extensions"
    };
    const result = buildPromptWithProfile(BASE, s);
    expect(result).toContain("Bailey");
    expect(result).toContain("Developer");
    expect(result).toContain("Casual, em-dashes");
    expect(result).toContain("Builds Firefox extensions");
  });

  test("base prompt appears after the profile block (profile first)", () => {
    const s = { profileEnabled: true, profileName: "Bailey" };
    const result = buildPromptWithProfile(BASE, s);
    const profileIdx = result.indexOf("Bailey");
    const baseIdx    = result.indexOf(BASE);
    expect(profileIdx).toBeLessThan(baseIdx);
  });

  test("uses a separator between profile and base prompt", () => {
    const s = { profileEnabled: true, profileName: "Bailey" };
    const result = buildPromptWithProfile(BASE, s);
    expect(result).toContain("---");
  });

  test("only name provided — does not include empty role/style/context lines", () => {
    const s = { profileEnabled: true, profileName: "Bailey" };
    const result = buildPromptWithProfile(BASE, s);
    expect(result).not.toContain("Role:");
    expect(result).not.toContain("Writing style");
    expect(result).not.toContain("Personal context");
  });
});
