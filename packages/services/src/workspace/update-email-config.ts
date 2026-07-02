import { eq } from "@openstatus/db";
import { workspace } from "@openstatus/db/src/schema";

import { emitAudit } from "../audit";
import { requireScope } from "../auth";
import { type ServiceContext, withTransaction } from "../context";
import { NotFoundError } from "../errors";
import { UpdateWorkspaceEmailConfigInput } from "./schemas";

/**
 * Update the email delivery configuration for the caller's workspace.
 * Stores provider choice and SMTP credentials as JSON in emailConfig column.
 */
export async function updateWorkspaceEmailConfig(args: {
  ctx: ServiceContext;
  input: UpdateWorkspaceEmailConfigInput;
}): Promise<void> {
  const { ctx } = args;
  requireScope(ctx, "write");
  const input = UpdateWorkspaceEmailConfigInput.parse(args.input);

  await withTransaction(ctx, async (tx) => {
    const existing = await tx
      .select()
      .from(workspace)
      .where(eq(workspace.id, ctx.workspace.id))
      .get();
    if (!existing) throw new NotFoundError("workspace", ctx.workspace.id);

    const emailConfig = JSON.stringify({
      provider: input.provider,
      smtpHost: input.smtpHost,
      smtpPort: input.smtpPort,
      smtpUser: input.smtpUser,
      smtpPass: input.smtpPass,
      smtpFrom: input.smtpFrom,
    });

    const updated = await tx
      .update(workspace)
      .set({ emailConfig, updatedAt: new Date() })
      .where(eq(workspace.id, ctx.workspace.id))
      .returning()
      .get();

    await emitAudit(tx, ctx, {
      action: "workspace.update",
      entityType: "workspace",
      entityId: ctx.workspace.id,
      before: existing,
      after: updated,
    });
  });
}
