import type { FC } from "hono/jsx";

import { injectThemeStyles } from "../lib/theme";
import { ThemeToggle } from "./theme-toggle";

export interface PageMeta {
  title: string;
  description?: string | null;
  icon?: string | null;
  themeKey?: string;
  forceTheme?: "light" | "dark" | "system" | null;
}

export const Layout: FC<{
  page: PageMeta;
  children?: JSX.Element | JSX.Element[];
}> = ({ page, children }) => {
  const themeCss = injectThemeStyles(page.themeKey);
  const themeClass = page.forceTheme === "dark" ? "dark" : "";

  return (
    <html lang="en" class={themeClass}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{page.title}</title>
        {page.description ? (
          <meta name="description" content={page.description} />
        ) : null}
        {page.icon ? (
          <link rel="icon" href={page.icon} />
        ) : (
          <link rel="icon" href="/static/favicon.ico" />
        )}
        <link rel="stylesheet" href="/static/styles.css" />
        {themeCss ? (
          <style
            id="theme-styles"
            dangerouslySetInnerHTML={{ __html: themeCss }}
          />
        ) : null}
      </head>
      <body
        hx-boost="true"
        class="bg-background text-foreground antialiased min-h-screen"
      >
        <div class="mx-auto flex w-full max-w-[718px] flex-1 flex-col px-4 py-2 md:px-2 md:py-4">
          {children}
        </div>
        <ThemeToggle />
        <script src="/static/htmx.min.js" />
        <script src="/static/alpine.min.js" defer />
      </body>
    </html>
  );
};
