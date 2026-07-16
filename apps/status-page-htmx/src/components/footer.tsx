import type { FC } from "hono/jsx";

export interface FooterProps {
  slug: string;
  whiteLabel?: boolean;
  updatedAt?: Date | string;
  prefix?: string;
}

/**
 * Status page footer.
 *
 * Shows:
 * - "Powered by openstatus.dev" (unless whiteLabel)
 * - Theme toggle (system / light / dark)
 * - Last-updated timestamp with live relative time
 */
export const Footer: FC<FooterProps> = ({
  slug,
  whiteLabel,
  updatedAt,
  prefix: _prefix,
}) => {
  const updatedIso = updatedAt ? new Date(updatedAt).toISOString() : null;

  return (
    <footer class="border-t border-border mt-8">
      <div class="mx-auto flex max-w-2xl items-center justify-between gap-4 px-3 py-2">
        {/* Powered by */}
        <div>
          {!whiteLabel ? (
            <p class="text-muted-foreground font-mono text-xs">
              Powered by{" "}
              <a
                href={`https://openstatus.dev?utm_medium=status-page&utm_source=${slug}`}
                target="_blank"
                rel="noreferrer"
                class="underline hover:text-foreground transition-colors"
              >
                openstatus.dev
              </a>
            </p>
          ) : null}
        </div>

        {/* Right side: timestamp + theme toggle */}
        <div
          class="flex items-center gap-3"
          x-data={`{
            updatedAt: ${updatedIso ? `'${updatedIso}'` : "null"},
            get relativeTime() {
              if (!this.updatedAt) return '';
              const now = Date.now();
              const then = new Date(this.updatedAt).getTime();
              const seconds = Math.floor((now - then) / 1000);
              if (seconds < 60) return 'just now';
              const minutes = Math.floor(seconds / 60);
              if (minutes < 60) return minutes + 'm ago';
              const hours = Math.floor(minutes / 60);
              if (hours < 24) return hours + 'h ago';
              return Math.floor(hours / 24) + 'd ago';
            },
            theme: localStorage.getItem('theme') || 'system',
            init() {
              this.applyTheme();
            },
            applyTheme() {
              const root = document.documentElement;
              if (this.theme === 'dark') root.classList.add('dark');
              else if (this.theme === 'light') root.classList.remove('dark');
              else {
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                root.classList.toggle('dark', prefersDark);
              }
              localStorage.setItem('theme', this.theme);
            },
            cycle() {
              if (this.theme === 'system') this.theme = 'light';
              else if (this.theme === 'light') this.theme = 'dark';
              else this.theme = 'system';
              this.applyTheme();
            }
          }`}
        >
          {/* Timestamp */}
          {updatedIso ? (
            <span class="text-muted-foreground/70 font-mono text-xs">
              Updated <span x-text="relativeTime" />
            </span>
          ) : null}

          {/* Theme toggle */}
          <button
            type="button"
            x-on:click="cycle()"
            class="flex items-center justify-center w-7 h-7 rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Toggle theme"
          >
            {/* Sun (dark mode) */}
            <svg
              x-show="theme === 'dark'"
              class="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2" />
              <path d="M12 20v2" />
              <path d="m4.93 4.93 1.41 1.41" />
              <path d="m17.66 17.66 1.41 1.41" />
              <path d="M2 12h2" />
              <path d="M20 12h2" />
              <path d="m6.34 17.66-1.41 1.41" />
              <path d="m19.07 4.93-1.41 1.41" />
            </svg>
            {/* Moon (light mode) */}
            <svg
              x-show="theme === 'light'"
              class="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
            </svg>
            {/* Monitor (system) */}
            <svg
              x-show="theme === 'system'"
              class="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect width="20" height="14" x="2" y="3" rx="2" />
              <line x1="8" x2="16" y1="21" y2="21" />
              <line x1="12" x2="12" y1="17" y2="21" />
            </svg>
          </button>
        </div>
      </div>
    </footer>
  );
};
