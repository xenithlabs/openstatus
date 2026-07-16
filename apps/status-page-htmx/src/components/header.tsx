import type { FC } from "hono/jsx";

import { UpdatesPopover } from "./updates-popover";

export interface HeaderProps {
  title: string;
  icon?: string | null;
  /** URL prefix for links. Empty string for custom-domain access (clean URLs). */
  prefix?: string;
  /** Status page slug, used for the subscribe popover. */
  slug?: string;
}

const navLinkClass =
  "inline-flex shrink-0 items-center justify-center text-sm font-medium whitespace-nowrap transition-all outline-none h-8 gap-1.5 rounded-md px-3 border border-transparent hover:bg-accent hover:text-accent-foreground";

const activeClass = "bg-accent text-accent-foreground";

export const Header: FC<HeaderProps> = ({ title, icon, prefix = "", slug }) => {
  // Normalize prefix: remove trailing slash
  const p = prefix.replace(/\/$/, "");

  return (
    <header class="flex items-center justify-between min-h-[36px] mt-2 gap-4">
      {/* Logo / Brand */}
      <div class="flex items-center shrink-0">
        {icon ? (
          <a href={p || "/"} class="flex items-center gap-3">
            <img
              src={icon}
              alt={title}
              class="h-6 w-auto max-w-[200px] object-scale-down object-left"
            />
          </a>
        ) : (
          <a href={p || "/"} class="text-xl font-medium">
            {title}
          </a>
        )}
      </div>

      {/* Navigation tabs */}
      <nav class="hidden md:flex flex-row gap-0.5">
        <a href={p || "/"} class={`${navLinkClass} ${!p ? activeClass : ""}`}>
          Status
        </a>
        <a href={`${p}/events`} class={navLinkClass}>
          Events
        </a>
        <a href={`${p}/monitors`} class={navLinkClass}>
          Monitors
        </a>
      </nav>

      {/* Subscribe popover */}
      <div class="sm:inline-flex items-center space-x-2 shrink-0">
        <UpdatesPopover
          prefix={p}
          slug={slug ?? ""}
          rssUrl={`${p}/feed`}
          jsonUrl={`${p}/feed/json`}
          atomUrl={`${p}/feed/atom`}
          sshCommand={`ssh ${slug ?? "status"}@ssh.openstatus.dev`}
        />
      </div>
    </header>
  );
};
