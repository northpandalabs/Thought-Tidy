const { wordCount, wordDiff, esc, escHtml, uid, todayDate, purgeOldLog } = require("../lib/text");

// ── wordCount ─────────────────────────────────────────────────────────────────

describe("wordCount", () => {
  test("counts words in a normal sentence", () => {
    expect(wordCount("Hello world foo")).toBe(3);
  });

  test("handles leading and trailing whitespace", () => {
    expect(wordCount("  hello world  ")).toBe(2);
  });

  test("handles multiple spaces between words", () => {
    expect(wordCount("hello   world")).toBe(2);
  });

  test("returns 0 for empty string", () => {
    expect(wordCount("")).toBe(0);
  });

  test("returns 0 for whitespace-only string", () => {
    expect(wordCount("   ")).toBe(0);
  });

  test("returns 1 for single word", () => {
    expect(wordCount("hello")).toBe(1);
  });

  test("handles newlines as word separators", () => {
    expect(wordCount("hello\nworld")).toBe(2);
  });

  test("handles tabs as word separators", () => {
    expect(wordCount("hello\tworld")).toBe(2);
  });
});

// ── wordDiff ──────────────────────────────────────────────────────────────────

describe("wordDiff", () => {
  test("shows word count with no change when same length", () => {
    expect(wordDiff("hello world", "foo bar")).toBe("2 words");
  });

  test("shows positive diff when result is longer", () => {
    expect(wordDiff("one two", "one two three four")).toBe("4 words (+2)");
  });

  test("shows negative diff when result is shorter", () => {
    expect(wordDiff("one two three", "one")).toBe("1 words (-2)");
  });

  test("handles empty original", () => {
    const result = wordDiff("", "hello world");
    expect(result).toContain("2 words");
    expect(result).toContain("+2");
  });
});

// ── esc ───────────────────────────────────────────────────────────────────────

describe("esc", () => {
  test("escapes ampersands", () => {
    expect(esc("rock & roll")).toBe("rock &amp; roll");
  });

  test("escapes less-than", () => {
    expect(esc("<script>")).toBe("&lt;script&gt;");
  });

  test("escapes greater-than", () => {
    expect(esc("a > b")).toBe("a &gt; b");
  });

  test("converts newlines to <br>", () => {
    expect(esc("line1\nline2")).toBe("line1<br>line2");
  });

  test("handles multiple escape targets in one string", () => {
    const result = esc("<a href='x'>\nhello & world");
    expect(result).toContain("&lt;");
    expect(result).toContain("&gt;");
    expect(result).toContain("&amp;");
    expect(result).toContain("<br>");
  });

  test("returns plain text unchanged", () => {
    expect(esc("hello world")).toBe("hello world");
  });

  test("does not escape double quotes (esc is for text nodes, not attributes)", () => {
    expect(esc('say "hello"')).toBe('say "hello"');
  });
});

// ── escHtml ───────────────────────────────────────────────────────────────────

describe("escHtml", () => {
  test("escapes ampersands", () => {
    expect(escHtml("a & b")).toBe("a &amp; b");
  });

  test("escapes double quotes", () => {
    expect(escHtml('say "hi"')).toBe("say &quot;hi&quot;");
  });

  test("escapes angle brackets", () => {
    expect(escHtml("<b>bold</b>")).toBe("&lt;b&gt;bold&lt;/b&gt;");
  });

  test("does NOT convert newlines (escHtml is for attributes, not text)", () => {
    expect(escHtml("a\nb")).toBe("a\nb");
  });

  test("returns plain text unchanged", () => {
    expect(escHtml("hello")).toBe("hello");
  });
});

// ── uid ───────────────────────────────────────────────────────────────────────

describe("uid", () => {
  test("returns a string", () => {
    expect(typeof uid()).toBe("string");
  });

  test("returns a 7-character string", () => {
    expect(uid()).toHaveLength(7);
  });

  test("returns only alphanumeric characters (base36)", () => {
    expect(uid()).toMatch(/^[a-z0-9]+$/);
  });

  test("returns unique values on successive calls", () => {
    const ids = Array.from({ length: 100 }, uid);
    const unique = new Set(ids);
    expect(unique.size).toBe(100);
  });
});

// ── todayDate ─────────────────────────────────────────────────────────────────

describe("todayDate", () => {
  test("returns a string in YYYY-MM-DD format", () => {
    expect(todayDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("matches the current date in local time", () => {
    const d = new Date();
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(todayDate()).toBe(expected);
  });

  test("zero-pads single-digit month and day", () => {
    const result = todayDate();
    const [, month, day] = result.split("-");
    expect(month).toHaveLength(2);
    expect(day).toHaveLength(2);
  });
});

// ── purgeOldLog ───────────────────────────────────────────────────────────────

describe("purgeOldLog", () => {
  const TODAY = todayDate();
  const YESTERDAY = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  test("returns empty array for undefined input", () => {
    expect(purgeOldLog(undefined)).toEqual([]);
  });

  test("returns empty array for empty array input", () => {
    expect(purgeOldLog([])).toEqual([]);
  });

  test("keeps entries from today", () => {
    const entries = [{ date: TODAY, action: "fix-spelling" }];
    expect(purgeOldLog(entries)).toHaveLength(1);
  });

  test("removes entries from yesterday", () => {
    const entries = [{ date: YESTERDAY, action: "fix-spelling" }];
    expect(purgeOldLog(entries)).toHaveLength(0);
  });

  test("keeps today and removes older entries in a mixed array", () => {
    const entries = [
      { date: YESTERDAY, action: "improve" },
      { date: TODAY,     action: "fix-spelling" },
      { date: "2020-01-01", action: "professional" }
    ];
    const result = purgeOldLog(entries);
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe("fix-spelling");
  });

  test("returns all entries when all are from today", () => {
    const entries = [
      { date: TODAY, action: "fix-spelling" },
      { date: TODAY, action: "professional" }
    ];
    expect(purgeOldLog(entries)).toHaveLength(2);
  });
});
