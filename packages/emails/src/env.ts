import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    RESEND_API_KEY: z.string().prefault(""),
    SMTP_HOST: z.string().prefault(""),
    SMTP_PORT: z.coerce.number().prefault(587),
    SMTP_USER: z.string().prefault(""),
    SMTP_PASS: z.string().prefault(""),
    SMTP_FROM: z.string().prefault(""),
  },
  runtimeEnv: {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    SMTP_FROM: process.env.SMTP_FROM,
  },
});
