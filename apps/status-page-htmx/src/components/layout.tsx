import type { FC } from "hono/jsx";

import { Footer } from "./footer";
import { injectThemeStyles } from "../lib/theme";

export interface PageMeta {
  title: string;
  description?: string | null;
  icon?: string | null;
  themeKey?: string;
  forceTheme?: "light" | "dark" | "system" | null;
  slug?: string;
  updatedAt?: Date | string;
  /** Embed mode: hides header/footer/banner via group-data CSS */
  embed?: boolean;
}

export const Layout: FC<{
  page: PageMeta;
  children?: any;
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
        class={`bg-background text-foreground antialiased min-h-screen ${page.embed ? "group/embed" : ""}`}
        {...(page.embed ? { "data-embed": "true" } : {})}
      >
        <div class="mx-auto flex w-full max-w-[718px] flex-1 flex-col px-4 py-2 md:px-2 md:py-4">
          {children}
        </div>
        <Footer slug={page.slug ?? ""} updatedAt={page.updatedAt} />
        <script src="/static/htmx.min.js" />
        <script src="/static/alpine.min.js" defer />
      </body>
    </html>
  );
};
