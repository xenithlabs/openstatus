/** @jsxImportSource react */

import { Effect, Schedule } from "effect";
import { render } from "react-email";

import FollowUpEmail from "../emails/followup";
import type { MonitorAlertProps } from "../emails/monitor-alert";
import PageSubscriptionEmail from "../emails/page-subscription";
import type { PageSubscriptionProps } from "../emails/page-subscription";
import SlackFeedbackEmail from "../emails/slack-feedback";
import StatusPageMagicLinkEmail from "../emails/status-page-magic-link";
import type { StatusPageMagicLinkProps } from "../emails/status-page-magic-link";
import StatusReportEmail from "../emails/status-report";
import type { StatusReportProps } from "../emails/status-report";
import TeamInvitationEmail from "../emails/team-invitation";
import type { TeamInvitationProps } from "../emails/team-invitation";
import { monitorAlertEmail } from "../hotfix/monitor-alert";
import { sendBatchEmailHtml, sendHtmlEmail, sendWithRender } from "./send";

// split an array into chunks of a given size.
function chunk<T>(array: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

export class EmailClient {
  constructor(_opts?: { apiKey?: string }) {
    // apiKey is kept for backward compatibility but no longer used directly.
    // Transport is selected from env vars (SMTP_HOST or RESEND_API_KEY).
    void _opts;
  }

  public async sendFollowUp(req: { to: string }) {
    if (process.env.NODE_ENV === "development") {
      console.log(`Sending follow up email to ${req.to}`);
      return;
    }

    try {
      await sendWithRender({
        react: <FollowUpEmail />,
        from: "Thibault Le Ouay Ducasse <welcome@openstatus.dev>",
        reply_to: "Thibault Le Ouay Ducasse <thibault@openstatus.dev>",
        subject: "How's it going with OpenStatus?",
        to: [req.to],
      });
      console.log(`Sent follow up email to ${req.to}`);
    } catch (err) {
      console.error(`Error sending follow up email to ${req.to}: ${err}`);
    }
  }

  public async sendFollowUpBatched(req: { to: string[] }) {
    if (process.env.NODE_ENV === "development") {
      console.log(`Sending follow up emails to ${req.to.join(", ")}`);
      return;
    }

    const html = await render(<FollowUpEmail />);
    try {
      await sendBatchEmailHtml(
        req.to.map((subscriber) => ({
          from: "Thibault Le Ouay Ducasse <thibault@openstatus.dev>",
          subject: "How's it going with OpenStatus?",
          to: subscriber,
          html,
        })),
      );
    } catch (err: unknown) {
      const e = err as { name?: string };
      if (e?.name === "rate_limit_exceeded") {
        throw err;
      }
      console.error(
        `Error sending follow up email to ${req.to}: ${err}`,
      );
      return;
    }

    console.log(`Sent follow up emails to ${req.to}`);
  }

  public async sendSlackFeedback(req: { to: string }) {
    if (process.env.NODE_ENV === "development") {
      console.log(`Sending slack feedback email to ${req.to}`);
      return;
    }

    try {
      await sendWithRender({
        react: <SlackFeedbackEmail />,
        from: "Thibault Le Ouay Ducasse <thibault@openstatus.dev>",
        reply_to: "Thibault Le Ouay Ducasse <thibault@openstatus.dev>",
        subject: "How's the Slack app working for you?",
        to: [req.to],
      });
      console.log(`Sent slack feedback email to ${req.to}`);
    } catch (err) {
      console.error(`Error sending slack feedback email to ${req.to}: ${err}`);
    }
  }

  public async sendSlackFeedbackBatched(req: { to: string[] }) {
    if (process.env.NODE_ENV === "development") {
      console.log(`Sending slack feedback emails to ${req.to.join(", ")}`);
      return;
    }

    const html = await render(<SlackFeedbackEmail />);
    try {
      await sendBatchEmailHtml(
        req.to.map((subscriber) => ({
          from: "Thibault Le Ouay Ducasse <thibault@openstatus.dev>",
          subject: "How's the Slack app working for you?",
          to: subscriber,
          html,
        })),
      );
    } catch (err: unknown) {
      const e = err as { name?: string };
      if (e?.name === "rate_limit_exceeded") {
        throw err;
      }
      console.error(
        `Error sending slack feedback email to ${req.to}: ${err}`,
      );
      return;
    }

    console.log(`Sent slack feedback emails to ${req.to}`);
  }

  public async sendStatusReportUpdate(
    req: Omit<StatusReportProps, "unsubscribeUrl" | "manageUrl"> & {
      subscribers: Array<{ email: string; token: string }>;
      pageSlug: string;
      customDomain?: string | null;
      idempotencyKey?: string;
    },
  ) {
    const statusPageBaseUrl = req.customDomain
      ? `https://${req.customDomain}`
      : `https://${req.pageSlug}.openstatus.dev`;

    if (process.env.NODE_ENV === "development") {
      console.log(
        `Sending status report update emails to ${req.subscribers
          .map((s) => s.email)
          .join(", ")}`,
      );
      return;
    }

    let batchIndex = 0;
    for (const recipients of chunk(req.subscribers, 100)) {
      const idempotencyKey = req.idempotencyKey
        ? `${req.idempotencyKey}:${batchIndex}`
        : undefined;
      batchIndex++;
      const sendEmail = Effect.tryPromise({
        try: async () => {
          const emails = await Promise.all(
            recipients.map(async (subscriber) => {
              const unsubscribeUrl = `${statusPageBaseUrl}/unsubscribe/${subscriber.token}`;
              const manageUrl = `${statusPageBaseUrl}/manage/${subscriber.token}`;
              const html = await render(
                <StatusReportEmail
                  {...req}
                  unsubscribeUrl={unsubscribeUrl}
                  manageUrl={manageUrl}
                />,
              );
              return {
                from: `${req.pageTitle} <notifications@notifications.openstatus.dev>`,
                subject: req.reportTitle,
                to: subscriber.email,
                html,
              };
            }),
          );
          await sendBatchEmailHtml(emails, idempotencyKey ? { idempotencyKey } : undefined);
        },
        catch: (_unknown) =>
          new Error(
            `Error sending status report update batch to ${recipients.map(
              (r) => r.email,
            )}`,
          ),
      }).pipe(
        Effect.retry({
          times: 3,
          schedule: Schedule.exponential("1000 millis"),
        }),
      );
      await Effect.runPromise(sendEmail).catch(console.error);
    }

    console.log(
      `Sent status report update email to ${req.subscribers.length} subscribers`,
    );
  }

  public async sendTeamInvitation(req: TeamInvitationProps & { to: string }) {
    if (process.env.NODE_ENV === "development") {
      console.log(`Sending team invitation email to ${req.to}`);
      return;
    }

    try {
      await sendWithRender({
        react: <TeamInvitationEmail {...req} />,
        from: `${
          req.workspaceName ?? "OpenStatus"
        } <notifications@notifications.openstatus.dev>`,
        subject: `You've been invited to join ${
          req.workspaceName ?? "OpenStatus"
        }`,
        to: [req.to],
      });
      console.log(`Sent team invitation email to ${req.to}`);
    } catch (err) {
      console.error(`Error sending team invitation email to ${req.to}`, err);
    }
  }

  public async sendMonitorAlert(req: MonitorAlertProps & { to: string }) {
    if (process.env.NODE_ENV === "development") {
      console.log(`Sending monitor alert email to ${req.to}`);
      return;
    }

    try {
      const html = monitorAlertEmail(req);
      await sendHtmlEmail({
        from: "OpenStatus <notifications@notifications.openstatus.dev>",
        subject: `${req.name}: ${req.type.toUpperCase()}`,
        to: req.to,
        html,
      });
      console.log(`Sent monitor alert email to ${req.to}`);
    } catch (err) {
      console.error(`Error sending monitor alert to ${req.to}`, err);
      throw err;
    }
  }

  public async sendPageSubscription(
    req: PageSubscriptionProps & { to: string },
  ) {
    if (process.env.NODE_ENV === "development") {
      console.log(`Sending page subscription email to ${req.to}`);
      return;
    }

    try {
      await sendWithRender({
        react: <PageSubscriptionEmail {...req} />,
        from: "Status Page <notifications@notifications.openstatus.dev>",
        subject: `Confirm your subscription to ${req.page}`,
        to: [req.to],
      });
      console.log(`Sent page subscription email to ${req.to}`);
    } catch (err) {
      console.error(`Error sending page subscription to ${req.to}`, err);
    }
  }

  public async sendStatusPageMagicLink(
    req: StatusPageMagicLinkProps & { to: string },
  ) {
    if (process.env.NODE_ENV === "development") {
      console.log(`Sending status page magic link email to ${req.to}`);
      console.log(`>>> Magic Link: ${req.link}`);
      return;
    }

    try {
      await sendWithRender({
        react: <StatusPageMagicLinkEmail {...req} />,
        from: "Status Page <notifications@notifications.openstatus.dev>",
        subject: `Authenticate to ${req.page}`,
        to: [req.to],
      });
      console.log(`Sent status page magic link email to ${req.to}`);
    } catch (err) {
      console.error(`Error sending status page magic link to ${req.to}`, err);
    }
  }

  public async sendMaintenanceNotification(req: {
    subscribers: Array<{ email: string; token: string }>;
    pageTitle: string;
    pageSlug: string;
    customDomain?: string | null;
    maintenanceTitle: string;
    message: string;
    from: string;
    to: string;
    pageComponents: string[];
  }) {
    const statusPageBaseUrl = req.customDomain
      ? `https://${req.customDomain}`
      : `https://${req.pageSlug}.openstatus.dev`;

    if (process.env.NODE_ENV === "development") {
      console.log(
        `Sending maintenance notification emails to ${req.subscribers
          .map((s) => s.email)
          .join(", ")}`,
      );
      return;
    }

    for (const recipients of chunk(req.subscribers, 100)) {
      const sendEmail = Effect.tryPromise({
        try: async () => {
          const emails = await Promise.all(
            recipients.map(async (subscriber) => {
              const unsubscribeUrl = `${statusPageBaseUrl}/unsubscribe/${subscriber.token}`;
              const manageUrl = `${statusPageBaseUrl}/manage/${subscriber.token}`;
              const html = await render(
                <StatusReportEmail
                  pageTitle={req.pageTitle}
                  reportTitle={req.maintenanceTitle}
                  status="maintenance"
                  date={`${req.from} - ${req.to}`}
                  message={req.message}
                  pageComponents={req.pageComponents}
                  unsubscribeUrl={unsubscribeUrl}
                  manageUrl={manageUrl}
                />,
              );
              return {
                from: `${req.pageTitle} <notifications@notifications.openstatus.dev>`,
                subject: `Scheduled Maintenance: ${req.maintenanceTitle}`,
                to: subscriber.email,
                html,
              };
            }),
          );
          await sendBatchEmailHtml(emails);
        },
        catch: (_unknown) =>
          new Error(
            `Error sending maintenance notification batch to ${recipients.map(
              (r) => r.email,
            )}`,
          ),
      }).pipe(
        Effect.retry({
          times: 3,
          schedule: Schedule.exponential("1000 millis"),
        }),
      );
      await Effect.runPromise(sendEmail).catch(console.error);
    }

    console.log(
      `Sent maintenance notification email to ${req.subscribers.length} subscribers`,
    );
  }
}
