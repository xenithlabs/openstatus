import type { FC } from "hono/jsx";

export interface MobileMenuProps {
  prefix: string;
  currentPath?: string;
}

const linkClass =
  "block w-full px-4 py-2 text-sm font-medium transition-colors hover:bg-muted text-left";

const activeLinkClass = "bg-accent text-accent-foreground";

function isActive(currentPath: string | undefined, href: string): boolean {
  if (!currentPath) return false;
  if (href === "/" || href === "") return currentPath === "/";
  return currentPath.startsWith(href);
}

export const MobileMenu: FC<MobileMenuProps> = ({ prefix, currentPath }) => {
  const p = prefix.replace(/\/$/, "");
  const links = [
    { href: p || "/", label: "Status" },
    { href: `${p}/events`, label: "Events" },
    { href: `${p}/monitors`, label: "Monitors" },
  ];

  return (
    <div class="md:hidden" x-data="{ open: false }">
      {/* Hamburger button */}
      <button
        type="button"
        class="flex items-center justify-center size-8 border rounded-md hover:bg-muted transition-colors"
        x-on:click="open = !open"
        aria-label="Toggle menu"
      >
        <svg
          class="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          x-show="!open"
        >
          <line x1="4" x2="20" y1="6" y2="6" />
          <line x1="4" x2="20" y1="12" y2="12" />
          <line x1="4" x2="20" y1="18" y2="18" />
        </svg>
        <svg
          class="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          x-show="open"
        >
          <line x1="18" x2="6" y1="6" y2="18" />
          <line x1="6" x2="18" y1="6" y2="18" />
        </svg>
      </button>

      {/* Slide-down sheet */}
      <div
        x-show="open"
        class="absolute left-0 right-0 top-full bg-card border-b border-border shadow-lg z-50"
        {...{ "x-on:click.outside": "open = false" } as Record<string, string>}
      >
        <div class="flex flex-col py-1">
          {links.map((link) => (
            <a
              href={link.href}
              class={`${linkClass} ${isActive(currentPath, link.href) ? activeLinkClass : "text-muted-foreground"}`}
              x-on:click="open = false"
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
};
