import { Events } from "@openstatus/analytics";
import {
  getWorkspaceWithUsage,
  listWorkspaces,
  updateWorkspaceEmailConfig,
  updateWorkspaceName,
} from "@openstatus/services/workspace";
import { z } from "zod";

import { toServiceCtx, toTRPCError } from "../service-adapter";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const workspaceRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await getWorkspaceWithUsage({ ctx: toServiceCtx(ctx) });
    } catch (err) {
      toTRPCError(err);
    }
  }),

  list: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await listWorkspaces({
        ctx: toServiceCtx(ctx),
        input: { userId: ctx.user.id },
      });
    } catch (err) {
      toTRPCError(err);
    }
  }),

  updateName: protectedProcedure
    .meta({ track: Events.UpdateWorkspace })
    .input(z.object({ name: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await updateWorkspaceName({
          ctx: toServiceCtx(ctx),
          input: { name: input.name },
        });
      } catch (err) {
        toTRPCError(err);
      }
    }),

  updateEmailConfig: protectedProcedure
    .meta({ track: Events.UpdateWorkspace })
    .input(
      z.object({
        provider: z.enum(["resend", "smtp"]),
        smtpHost: z.string().optional(),
        smtpPort: z.number().int().min(1).max(65535).optional(),
        smtpUser: z.string().optional(),
        smtpPass: z.string().optional(),
        smtpFrom: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await updateWorkspaceEmailConfig({
          ctx: toServiceCtx(ctx),
          input: {
            provider: input.provider,
            smtpHost: input.smtpHost ?? "",
            smtpPort: input.smtpPort ?? 587,
            smtpUser: input.smtpUser ?? "",
            smtpPass: input.smtpPass ?? "",
            smtpFrom: input.smtpFrom ?? "",
          },
        });
      } catch (err) {
        toTRPCError(err);
      }
    }),
});
