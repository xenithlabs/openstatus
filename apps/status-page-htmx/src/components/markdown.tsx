import type { FC } from "hono/jsx";

import { renderMarkdown } from "../lib/markdown";

/**
 * Server-side markdown-to-HTML component.
 *
 * Renders a markdown string as HTML inside a `<div>` with prose styling.
 * Safe: raw HTML in the markdown source is not passed through by `marked`
 * in its default configuration.
 *
 * Usage:
 *   <Markdown content={reportUpdate.message} />
 */
export const Markdown: FC<{ content?: string | null }> = ({ content }) => {
  if (!content) return null;

  const html = renderMarkdown(content);

  return (
    <div
      class="prose dark:prose-invert prose-sm max-w-none [&_a]:underline [&_a]:text-primary [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:my-1"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
