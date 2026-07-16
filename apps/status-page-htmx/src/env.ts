import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  // URL of the tRPC API server. When "self" (default in production),
  // serves the tRPC router in-process instead of forwarding to an external API.
  TRPC_URL: z.string().default("self"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  // Log level: debug (all traffic), info (default), error (only failures)
  LOG_LEVEL: z.enum(["debug", "info", "error"]).default("info"),
  // Override the page slug — when set, ignores host-based domain extraction.
  // Use this to serve a specific page regardless of the incoming host header.
  // Example: PAGE_SLUG=status would serve the page with slug "status"
  //          even when accessed via status-htmx.openstat.us
  PAGE_SLUG: z.string().optional(),
});

export const env = schema.parse(process.env);
