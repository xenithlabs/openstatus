import type { FC } from "hono/jsx";

/**
 * Copy-to-clipboard button. Uses Alpine.js for the clipboard interaction.
 *
 * Usage:
 *   <CopyLink url={currentPageUrl} />
 */
export const CopyLink: FC<{ url: string }> = ({ url }) => {
  return (
    <button
      type="button"
      x-data="{ copied: false }"
      x-on:click={`navigator.clipboard.writeText('${url.replace(/'/g, "\\'")}').then(() => { copied = true; setTimeout(() => copied = false, 2000) })`}
      class="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
      aria-label="Copy link"
    >
      {/* Clipboard icon */}
      <svg
        x-show="!copied"
        class="w-3.5 h-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
      </svg>
      {/* Checkmark icon (shown when copied) */}
      <svg
        x-show="copied"
        class="w-3.5 h-3.5 text-success"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
      <span x-show="!copied">Copy link</span>
      <span x-show="copied" class="text-success">Copied!</span>
    </button>
  );
};
