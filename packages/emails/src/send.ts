import type { Transporter } from "nodemailer";
import type React from "react";
import { render } from "react-email";
import { Resend } from "resend";

import { env } from "./env";

// ---- Workspace-level config override ----

export interface WorkspaceEmailConfig {
  provider: "resend" | "smtp";
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
}

let _workspaceConfig: WorkspaceEmailConfig | null = null;
let _workspaceSmtpTransport: Transporter | null = null;

/**
 * Override the email transport with workspace-level config.
 * Call once per-request / per-invocation before sending any emails.
 * Falls back to env vars when not called or config is null.
 */
export function setWorkspaceEmailConfig(
  config: WorkspaceEmailConfig | null,
): void {
  _workspaceConfig = config;
  _workspaceSmtpTransport = null;
  _transport = null;
}

// ---- Transport selection ----

let _transport: "resend" | "smtp" | null = null;

function getTransportType(): "resend" | "smtp" {
  if (_transport) return _transport;

  // Workspace config takes priority
  if (_workspaceConfig?.provider === "smtp" && _workspaceConfig.smtpHost) {
    _transport = "smtp";
    return "smtp";
  }
  if (_workspaceConfig?.provider === "resend") {
    _transport = "resend";
    return "resend";
  }

  // Fall back to env vars
  if (env.SMTP_HOST) {
    _transport = "smtp";
    return "smtp";
  }
  if (env.RESEND_API_KEY) {
    _transport = "resend";
    return "resend";
  }
  throw new Error(
    "No email transport configured. Set SMTP_HOST or RESEND_API_KEY.",
  );
}

// Lazy-initialized nodemailer transport
let _smtpTransport: Transporter | null = null;

async function getSmtpTransport(): Promise<Transporter> {
  // Use workspace-level SMTP config when available
  if (_workspaceConfig?.provider === "smtp") {
    if (!_workspaceSmtpTransport) {
      const { createTransport } = await import("nodemailer");
      _workspaceSmtpTransport = createTransport({
        host: _workspaceConfig.smtpHost,
        port: _workspaceConfig.smtpPort,
        secure: _workspaceConfig.smtpPort === 465,
        auth: {
          user: _workspaceConfig.smtpUser,
          pass: _workspaceConfig.smtpPass,
        },
      });
    }
    return _workspaceSmtpTransport;
  }

  // Fall back to env-var SMTP transport
  if (!_smtpTransport) {
    const { createTransport } = await import("nodemailer");
    _smtpTransport = createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
  }
  return _smtpTransport;
}

// Lazy-initialized Resend client
let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(env.RESEND_API_KEY);
  }
  return _resend;
}

// ---- Types ----

export interface Emails {
  react: React.JSX.Element;
  subject: string;
  to: string[];
  from: string;
  reply_to?: string;
}

export type EmailHtml = {
  html: string;
  subject: string;
  to: string;
  from: string;
  reply_to?: string;
};

// ---- Send single email ----

export const sendEmail = async (email: Emails) => {
  if (process.env.NODE_ENV !== "production") return;
  const html = await render(email.react);

  if (getTransportType() === "smtp") {
    (await getSmtpTransport()).sendMail({
      from: email.from,
      to: email.to,
      subject: email.subject,
      html,
      ...(email.reply_to ? { replyTo: email.reply_to } : {}),
    });
    return;
  }

  await getResend().emails.send({ ...email, html });
};

// ---- Send batch emails ----

export const sendBatchEmailHtml = async (
  emails: EmailHtml[],
  opts?: { idempotencyKey?: string },
) => {
  if (process.env.NODE_ENV !== "production") return;

  if (getTransportType() === "smtp") {
    const transport = await getSmtpTransport();
    for (const email of emails) {
      await transport.sendMail({
        from: email.from,
        to: email.to,
        subject: email.subject,
        html: email.html,
        ...(email.reply_to ? { replyTo: email.reply_to } : {}),
      });
    }
    return;
  }

  await getResend().batch.send(emails, opts);
};

// ---- Send pre-rendered HTML email ----

export const sendHtmlEmail = async (email: EmailHtml) => {
  if (process.env.NODE_ENV !== "production") return;

  if (getTransportType() === "smtp") {
    (await getSmtpTransport()).sendMail({
      from: email.from,
      to: email.to,
      subject: email.subject,
      html: email.html,
      ...(email.reply_to ? { replyTo: email.reply_to } : {}),
    });
    return;
  }

  await getResend().emails.send({
    from: email.from,
    to: email.to,
    subject: email.subject,
    html: email.html,
    ...(email.reply_to ? { reply_to: email.reply_to } : {}),
  });
};

// ---- Send with render ----

export const sendWithRender = async (email: Emails) => {
  if (process.env.NODE_ENV !== "production") return;
  const html = await render(email.react);

  if (getTransportType() === "smtp") {
    (await getSmtpTransport()).sendMail({
      from: email.from,
      to: email.to,
      subject: email.subject,
      html,
      ...(email.reply_to ? { replyTo: email.reply_to } : {}),
    });
    return;
  }

  await getResend().emails.send({ ...email, html });
};
