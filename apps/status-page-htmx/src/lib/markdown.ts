import { marked } from "marked";

/**
 * Render markdown string to safe HTML.
 *
 * Configures `marked` with:
 * - `breaks: true` — single newlines become `<br>` (GitHub-flavored)
 * - `gfm: true` — tables, strikethrough, task lists, autolinks
 * - No raw HTML passthrough for safety
 */
export function renderMarkdown(md: string): string {
  if (!md) return "";

  return marked.parse(md, {
    breaks: true,
    gfm: true,
  }) as string;
}
