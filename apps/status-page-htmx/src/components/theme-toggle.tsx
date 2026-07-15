import type { FC } from "hono/jsx";

/**
 * Floating theme toggle button (bottom-right corner).
 * Uses Alpine.js for state management and localStorage persistence.
 *
 * Cycles: system → light → dark → system
 */
export const ThemeToggle: FC = () => {
  return (
    <div
      x-data={`{
        theme: localStorage.getItem('theme') || 'system',
        init() {
          this.applyTheme();
          this.$watch('theme', () => this.applyTheme());
        },
        applyTheme() {
          const root = document.documentElement;
          if (this.theme === 'dark') {
            root.classList.add('dark');
          } else if (this.theme === 'light') {
            root.classList.remove('dark');
          } else {
            // system — follow OS preference
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            root.classList.toggle('dark', prefersDark);
          }
          localStorage.setItem('theme', this.theme);
        },
        cycle() {
          if (this.theme === 'system') this.theme = 'light';
          else if (this.theme === 'light') this.theme = 'dark';
          else this.theme = 'system';
        }
      }`}
      class="fixed bottom-4 right-4 z-50"
    >
      <button
        type="button"
        x-on:click="cycle()"
        class="flex items-center justify-center w-9 h-9 rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shadow-sm"
        aria-label="Toggle theme"
      >
        {/* Sun icon — shown in dark mode */}
        <svg
          x-show="theme === 'dark'"
          class="w-4 h-4"
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
        {/* Moon icon — shown in light mode */}
        <svg
          x-show="theme === 'light'"
          class="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
        {/* Monitor icon — shown in system mode */}
        <svg
          x-show="theme === 'system'"
          class="w-4 h-4"
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
  );
};
