import {
  page,
  pageComponent,
  selectPageSchema,
} from "@openstatus/db/src/schema";
import { db as defaultDb, sql } from "@openstatus/db";

import { emitAudit } from "../audit";
import { requireScope } from "../auth";
import { type ServiceContext, withTransaction } from "../context";
import type { Page } from "../types";
import {
  assertAccessTypeAllowed,
  assertSlugAvailable,
  assertStatusPageQuota,
  validateMonitorIdsActive,
} from "./internal";
import { CreatePageInput, NewPageInput } from "./schemas";

/** Full create — mirrors legacy `pageRouter.create` (insertPageSchema input). */
export async function createPage(args: {
  ctx: ServiceContext;
  input: CreatePageInput;
}): Promise<Page> {
  const { ctx } = args;
  requireScope(ctx, "write");
  const input = CreatePageInput.parse(args.input);

  return withTransaction(ctx, async (tx) => {
    await assertStatusPageQuota(tx, ctx.workspace);
    await assertSlugAvailable({ tx, slug: input.slug });
    assertAccessTypeAllowed(ctx.workspace, {
      accessType: input.accessType ?? "public",
      passwordProtected: input.passwordProtected ?? null,
      allowedIpRanges: input.allowedIpRanges ?? null,
      allowIndex: input.allowIndex,
    });

    const {
      monitors,
      workspaceId: _ws,
      id: _id,
      configuration,
      ...pageProps
    } = input;
    const monitorIds = monitors?.map((m) => m.monitorId) ?? [];

    const row = await tx
      .insert(page)
      .values({
        workspaceId: ctx.workspace.id,
        // `page.configuration` is a drizzle `text("…", { mode: "json" })`
        // column — drizzle serialises objects automatically. Calling
        // `JSON.stringify` first would double-encode and persist a raw
        // JSON string, breaking downstream reads that expect an object.
        configuration,
        ...pageProps,
        authEmailDomains: pageProps.authEmailDomains?.join(","),
        allowedIpRanges: pageProps.allowedIpRanges?.join(","),
      })
      .returning()
      .get();

    if (monitorIds.length > 0) {
      const validMonitors = await validateMonitorIdsActive({
        tx,
        workspaceId: ctx.workspace.id,
        monitorIds,
      });
      const monitorMap = new Map(validMonitors.map((m) => [m.id, m]));
      const pageComponentValues = (monitors ?? [])
        .map(({ monitorId }, index) => {
          const m = monitorMap.get(monitorId);
          if (!m || !m.workspaceId) return null;
          return {
            workspaceId: m.workspaceId,
            pageId: row.id,
            type: "monitor" as const,
            monitorId,
            name: m.externalName || m.name,
            order: index,
            groupId: null,
            groupOrder: 0,
          };
        })
        .filter((v): v is NonNullable<typeof v> => v !== null);
      if (pageComponentValues.length > 0) {
        await tx.insert(pageComponent).values(pageComponentValues).run();
      }
    }

    await emitAudit(tx, ctx, {
      action: "page.create",
      entityType: "page",
      entityId: row.id,
      after: row,
      metadata: { slug: row.slug },
    });

    // `selectPageSchema.parse` normalises the drizzle row into the
    // `Page` shape callers expect: `authEmailDomains` / `allowedIpRanges`
    // go from the raw comma-joined string (drizzle-inferred) to the
    // `string[]` the `selectPageSchema` defines. Previously this used
    // `row as unknown as Page`, which hid the drift.
    return selectPageSchema.parse(row);
  });
}

/**
 * Derive a valid slug from a custom domain hostname.
 * e.g. `status.mycompany.com` → `status-mycompany-com`
 */
function slugFromDomain(domain: string): string {
  return domain
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 128);
}

/** Minimal create — matches the dashboard onboarding `new` shape. */
export async function newPage(args: {
  ctx: ServiceContext;
  input: NewPageInput;
}): Promise<Page> {
  const { ctx } = args;
  requireScope(ctx, "write");
  const input = NewPageInput.parse(args.input);

  const isSelfHosted = input.selfHosted === true && !!input.customDomain;

  // For self-hosted pages: use the user-provided slug if non-empty, otherwise
  // auto-derive from the custom domain. Falls back to a random suffix on collision.
  let finalSlug: string;
  if (isSelfHosted) {
    finalSlug =
      (input.slug?.trim() || slugFromDomain(input.customDomain!)) ||
      `page-${Math.random().toString(36).slice(2, 6)}`;
    // Deconflict: append random suffix if the slug is already taken
    const db = ctx.db ?? defaultDb;
    const rows = await db
      .select({ id: page.id })
      .from(page)
      .where(sql`lower(${page.slug}) = ${finalSlug}`)
      .all();
    if (rows.length > 0) {
      finalSlug = `${finalSlug.slice(0, 120)}-${Math.random().toString(36).slice(2, 6)}`;
    }
  } else {
    // superRefine guarantees slug is present for non-self-hosted pages
    finalSlug = input.slug!;
  }

  return withTransaction(ctx, async (tx) => {
    await assertStatusPageQuota(tx, ctx.workspace);
    await assertSlugAvailable({ tx, slug: finalSlug });

    const defaultConfiguration = {
      type: "absolute",
      value: "requests",
      uptime: true,
      theme: "default-rounded",
    };

    const row = await tx
      .insert(page)
      .values({
        workspaceId: ctx.workspace.id,
        title: input.title,
        slug: finalSlug,
        description: input.description ?? "",
        icon: input.icon ?? "",
        legacyPage: false,
        configuration: defaultConfiguration,
        customDomain: isSelfHosted ? input.customDomain! : "",
        allowIndex: true,
        selfHosted: isSelfHosted,
      })
      .returning()
      .get();

    await emitAudit(tx, ctx, {
      action: "page.create",
      entityType: "page",
      entityId: row.id,
      after: row,
      metadata: { slug: row.slug, source: "new", selfHosted: isSelfHosted },
    });

    // `selectPageSchema.parse` normalises the drizzle row into the
    // `Page` shape callers expect: `authEmailDomains` / `allowedIpRanges`
    // go from the raw comma-joined string (drizzle-inferred) to the
    // `string[]` the `selectPageSchema` defines. Previously this used
    // `row as unknown as Page`, which hid the drift.
    return selectPageSchema.parse(row);
  });
}
