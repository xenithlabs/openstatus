import { z } from "zod";
import type { Context } from "hono";

import { Header } from "../components/header";
import { Layout } from "../components/layout";
import {
  SubscribeError,
  SubscribeForm,
  SubscribeSuccess,
} from "../components/subscribe-form";
import { getPrefix } from "../lib/prefix";
import { trpc } from "../lib/trpc";

// ── GET /subscribe — Render the subscribe form page ─────────────────────────

export async function subscribePageHandler(c: Context): Promise<Response> {
  const slug = c.get("slug");
  const prefix = getPrefix(c);

  // Fetch page for the header
  let page;
  try {
    page = await trpc.statusPage.get.query({ slug });
  } catch {
    page = null;
  }

  return c.html(
    <Layout
      page={{
        title: page ? `${page.title} — Subscribe` : "Subscribe to updates",
        icon: page?.icon ?? null,
        themeKey: (page?.configuration as Record<string, unknown>)?.theme as string | undefined,
      }}
    >
      <Header
        title={page?.title ?? slug}
        icon={page?.icon ?? null}
        prefix={prefix}
      />
      <div class="flex flex-col gap-6 mt-4">
        <SubscribeForm prefix={prefix} />
        <div class="flex justify-center">
          <a
            href={prefix}
            class="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to status page
          </a>
        </div>
      </div>
    </Layout>,
  );
}

// ── POST /subscribe — Handle form submission ────────────────────────────────

const subscribeSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

export async function subscribePostHandler(c: Context): Promise<Response> {
  const slug = c.get("slug");
  const prefix = getPrefix(c);

  // Parse form body
  let body: Record<string, string>;
  try {
    body = await c.req.parseBody() as Record<string, string>;
  } catch {
    return c.html(
      <SubscribeError message="Invalid form submission. Please try again." />,
      400,
    );
  }

  const parsed = subscribeSchema.safeParse({ email: body.email });
  if (!parsed.success) {
    return c.html(
      <SubscribeError message={parsed.error.errors[0]?.message ?? "Invalid email"} />,
      400,
    );
  }

  // Call tRPC to create subscription
  try {
    await trpc.statusPage.subscribe.mutate({
      slug,
      email: parsed.data.email,
      subscribeComponents: false,
      pageComponents: [],
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to subscribe. Please try again.";
    return c.html(<SubscribeError message={message} />, 400);
  }

  return c.html(<SubscribeSuccess email={parsed.data.email} />);
}
