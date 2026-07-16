import type { FC } from "hono/jsx";

// ── Types ───────────────────────────────────────────────────────────────────

export interface FloatingConfigProps {
  pageId?: number;
  token?: string;
}

// ── Component ───────────────────────────────────────────────────────────────

/**
 * Token-gated floating settings button (bottom-right corner).
 *
 * Visible when:
 * - localStorage has matching "configuration-token", or
 * - URL has ?configuration-token=<token>, or
 * - Running on localhost / stpg.dev / openstatus.dev / vercel.app
 *
 * Opens an Alpine.js popover with display settings. Settings are
 * visual-only in this view — "Save Configuration" links to the
 * dashboard for permanent changes.
 */
export const FloatingConfig: FC<FloatingConfigProps> = ({
  pageId,
  token,
}) => {
  // Build Alpine visibility check as a string expression
  const tokenCheck = token
    ? `(localStorage.getItem('configuration-token') === '${token}' || new URLSearchParams(window.location.search).get('configuration-token') === '${token}')`
    : "false";

  const hostCheck =
    "window.location.host.includes('localhost') || window.location.host.includes('stpg.dev') || window.location.host.includes('openstatus.dev') || window.location.host.includes('vercel.app')";

  return (
    <div
      class="fixed right-4 bottom-4 z-50"
      x-data={`{
        open: false,
        visible: false,
        barType: 'absolute',
        showUptime: true,
        historyDays: '45',
        init() {
          this.visible = ${tokenCheck} || ${hostCheck};
        },
        toggle() { this.open = !this.open; },
        close() { this.open = false; }
      }`}
      x-show="visible"
      style="display: none"
    >
      {/* Gear icon button */}
      <button
        type="button"
        x-on:click="toggle()"
        class="flex items-center justify-center w-10 h-10 rounded-full border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted shadow-lg transition-colors"
        aria-label="Status page settings"
      >
        <svg
          class="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>

      {/* Settings popover */}
      <div
        x-show="open"
        class="absolute bottom-12 right-0 w-72 bg-card border border-border rounded-lg shadow-xl p-4"
        style="display: none"
      >
        <h4 class="font-medium text-sm mb-3">Status Page Settings</h4>

        {/* Bar Type */}
        <div class="mb-3">
          <label class="text-xs text-muted-foreground block mb-1">Bar Type</label>
          <select
            x-model="barType"
            class="w-full h-8 rounded-md border border-input bg-transparent px-2 text-xs"
          >
            <option value="absolute">Absolute</option>
            <option value="manual">Manual</option>
          </select>
        </div>

        {/* Show Uptime */}
        <div class="mb-3 flex items-center justify-between">
          <label class="text-xs text-muted-foreground">Show Uptime</label>
          <button
            type="button"
            x-on:click="showUptime = !showUptime"
            class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
            x-bind:class="showUptime ? 'bg-primary' : 'bg-muted'"
          >
            <span
              class="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
              x-bind:class="showUptime ? 'translate-x-4' : 'translate-x-1'"
            />
          </button>
        </div>

        {/* History Days */}
        <div class="mb-4">
          <label class="text-xs text-muted-foreground block mb-1">History</label>
          <select
            x-model="historyDays"
            class="w-full h-8 rounded-md border border-input bg-transparent px-2 text-xs"
          >
            <option value="30">30 days</option>
            <option value="45">45 days</option>
            <option value="90">90 days</option>
          </select>
        </div>

        {/* Save button */}
        <a
          href={
            pageId
              ? `https://app.openstatus.dev/status-pages/${pageId}/components`
              : "https://app.openstatus.dev/status-pages"
          }
          target="_blank"
          rel="noreferrer"
          class="flex items-center justify-center w-full h-8 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
        >
          Save Configuration
        </a>

        <p class="text-[10px] text-muted-foreground mt-2 text-center">
          Settings are preview-only here. Save permanently in the dashboard.
        </p>
      </div>
    </div>
  );
};
