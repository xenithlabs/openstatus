import { generateThemeStyles } from "@openstatus/theme-store";

/**
 * Generate CSS custom properties for the given theme key.
 * Returns just the CSS rules (no &lt;style&gt; wrapper) for use with
 * Hono JSX's `dangerouslySetInnerHTML` inside a &lt;style&gt; element.
 * Falls back to the default (openstatus) theme if the key is not found.
 */
export function injectThemeStyles(themeKey?: string): string {
  return generateThemeStyles(themeKey);
}
