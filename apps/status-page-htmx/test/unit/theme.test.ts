import { describe, expect, test } from "bun:test";

import { injectThemeStyles } from "../../src/lib/theme";

describe("injectThemeStyles", () => {
  test("returns CSS custom properties string", () => {
    const css = injectThemeStyles();
    expect(css).toContain("--background:");
    expect(css).toContain("--foreground:");
    // Theme store outputs: --success, --destructive, --warning, --info
    expect(css).toContain("--success:");
    expect(css).toContain("--destructive:");
  });

  test("returns light and dark variables", () => {
    const css = injectThemeStyles();
    expect(css).toContain(":root");
    expect(css).toContain(".dark");
  });

  test("returns fallback theme for unknown key", () => {
    const css = injectThemeStyles("nonexistent-theme-key");
    // Should still return valid CSS (falls back to openstatus theme)
    expect(css).toContain("--background:");
    expect(css).toContain(":root");
  });

  test("returns specific theme for known key", () => {
    // Test with "openai" theme if it exists
    const css = injectThemeStyles("openai");
    expect(css).toContain(":root");
    expect(css).toContain(".dark");
    // The openai theme should still have standard variables
    expect(css).toContain("--background:");
  });

  test("result is non-empty string", () => {
    const css = injectThemeStyles();
    expect(typeof css).toBe("string");
    expect(css.length).toBeGreaterThan(0);
  });
});
