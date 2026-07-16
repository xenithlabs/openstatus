import type { FC } from "hono/jsx";

export interface UpdatesPopoverProps {
  prefix: string;
  slug: string;
  rssUrl: string;
  atomUrl: string;
  jsonUrl: string;
  sshCommand: string;
}

/** Helper: build the Alpine x-bind:class expression as a pre-computed string. */
function tabClassExpr(tab: string): string {
  return `activeTab === '${tab}' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'`;
}

/** Inline SVG clipboard icon. */
const ClipboardIcon: FC = () => (
  <svg
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
);

const CheckIcon: FC = () => (
  <svg
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
);

function copyClickExpr(expr: string): string {
  return `navigator.clipboard.writeText(${expr}).then(function(){ copied = true; setTimeout(function(){ copied = false; }, 2000); })`;
}

function quoteAttr(s: string): string {
  return `'${s.replace(/'/g, "\\'")}'`;
}

/**
 * Updates popover — triggered from the header's subscribe button.
 */
export const UpdatesPopover: FC<UpdatesPopoverProps> = ({
  prefix,
  rssUrl,
  atomUrl: _atomUrl,
  jsonUrl,
  sshCommand,
}) => {
  const rssCopyUrl = `window.location.origin + '${rssUrl}'`;
  const jsonCopyUrl = `window.location.origin + '${jsonUrl}'`;

  return (
    <div class="relative" x-data="{ open: false, activeTab: 'Email' }">
      {/* Trigger button */}
      <button
        type="button"
        x-on:click="open = !open"
        class="transition text-sm focus:outline-none px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
      >
        Subscribe to updates
      </button>

      {/* Popover */}
      <div
        x-show="open"
        class="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-lg shadow-lg z-50"
        style="display: none"
      >
        {/* Tab bar */}
        <div class="flex border-b border-border/50 px-1 pt-2">
          <button type="button" class="flex-1 px-2 py-2 text-xs font-medium transition-colors border-b-2 -mb-[1px] truncate rounded-t" x-on:click="activeTab = 'Email'" x-bind:class={tabClassExpr("Email")}>Email</button>
          <button type="button" class="flex-1 px-2 py-2 text-xs font-medium transition-colors border-b-2 -mb-[1px] truncate rounded-t" x-on:click="activeTab = 'Slack'" x-bind:class={tabClassExpr("Slack")}>Slack</button>
          <button type="button" class="flex-1 px-2 py-2 text-xs font-medium transition-colors border-b-2 -mb-[1px] truncate rounded-t" x-on:click="activeTab = 'RSS'" x-bind:class={tabClassExpr("RSS")}>RSS</button>
          <button type="button" class="flex-1 px-2 py-2 text-xs font-medium transition-colors border-b-2 -mb-[1px] truncate rounded-t" x-on:click="activeTab = 'JSON'" x-bind:class={tabClassExpr("JSON")}>JSON</button>
          <button type="button" class="flex-1 px-2 py-2 text-xs font-medium transition-colors border-b-2 -mb-[1px] truncate rounded-t" x-on:click="activeTab = 'SSH'" x-bind:class={tabClassExpr("SSH")}>SSH</button>
        </div>

        {/* Tab panes */}
        <div class="p-3">

          {/* Email tab */}
          <div x-show="activeTab === 'Email'">
            <form
              hx-post={`${prefix}/subscribe`}
              hx-target="#popover-subscribe-result"
              hx-swap="outerHTML"
              class="flex flex-col gap-2"
            >
              <label class="text-xs text-muted-foreground">Email address</label>
              <input
                name="email"
                type="email"
                required
                placeholder="you@example.com"
                class="flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <button
                type="submit"
                class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 h-8 px-3 py-1 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Subscribe
              </button>
            </form>
            <div id="popover-subscribe-result" />
          </div>

          {/* Slack tab */}
          <div x-show="activeTab === 'Slack'" class="text-xs text-muted-foreground space-y-2">
            <p>
              Get updates in Slack by subscribing to the RSS feed with the
              RSS Slack app, or use a webhook integration.
            </p>
            <div class="flex items-center justify-between bg-muted/50 rounded px-2 py-1.5">
              <code class="text-xs break-all">{rssUrl}</code>
              <button
                type="button"
                x-data="{ copied: false }"
                x-on:click={copyClickExpr(rssCopyUrl)}
                class="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
                aria-label="Copy"
              >
                <span x-show="!copied"><ClipboardIcon /></span>
                <span x-show="copied"><CheckIcon /></span>
              </button>
            </div>
          </div>

          {/* RSS tab */}
          <div x-show="activeTab === 'RSS'" class="text-xs text-muted-foreground space-y-2">
            <p>Subscribe via RSS to get incident updates in your feed reader.</p>
            <div class="flex items-center justify-between bg-muted/50 rounded px-2 py-1.5">
              <a href={rssUrl} class="text-xs break-all hover:text-foreground transition-colors">
                {rssUrl}
              </a>
              <button
                type="button"
                x-data="{ copied: false }"
                x-on:click={copyClickExpr(rssCopyUrl)}
                class="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
                aria-label="Copy"
              >
                <span x-show="!copied"><ClipboardIcon /></span>
                <span x-show="copied"><CheckIcon /></span>
              </button>
            </div>
          </div>

          {/* JSON tab */}
          <div x-show="activeTab === 'JSON'" class="text-xs text-muted-foreground space-y-2">
            <p>Programmatic access to incident data in JSON format.</p>
            <div class="flex items-center justify-between bg-muted/50 rounded px-2 py-1.5">
              <a href={jsonUrl} class="text-xs break-all hover:text-foreground transition-colors">
                {jsonUrl}
              </a>
              <button
                type="button"
                x-data="{ copied: false }"
                x-on:click={copyClickExpr(jsonCopyUrl)}
                class="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
                aria-label="Copy"
              >
                <span x-show="!copied"><ClipboardIcon /></span>
                <span x-show="copied"><CheckIcon /></span>
              </button>
            </div>
          </div>

          {/* SSH tab */}
          <div x-show="activeTab === 'SSH'" class="text-xs text-muted-foreground space-y-2">
            <p>Use SSH to subscribe to incident updates.</p>
            <div class="flex items-center justify-between bg-muted/50 rounded px-2 py-1.5">
              <code class="text-xs break-all">{sshCommand}</code>
              <button
                type="button"
                x-data="{ copied: false }"
                x-on:click={copyClickExpr(quoteAttr(sshCommand))}
                class="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
                aria-label="Copy"
              >
                <span x-show="!copied"><ClipboardIcon /></span>
                <span x-show="copied"><CheckIcon /></span>
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
