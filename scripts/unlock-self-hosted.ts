/**
 * Self-Hosted Feature Unlock Script
 *
 * Updates all workspaces in the database to unlock every feature
 * with generous limits suitable for self-hosted deployments.
 *
 * Usage (Docker):
 *   docker compose run --rm db-seed sh -c "bun scripts/unlock-self-hosted.ts"
 *
 * Usage (host, requires DATABASE_URL + DATABASE_AUTH_TOKEN):
 *   bun run scripts/unlock-self-hosted.ts
 */

import { createClient } from "@libsql/client";

const DATABASE_URL = process.env.DATABASE_URL || "http://localhost:8080";

// All feature flags enabled; numeric limits set high for self-hosted.
const SELF_HOSTED_LIMITS = {
  // Monitor limits
  monitors: 9999,
  "synthetic-checks": 999_999,
  periodicity: ["30s", "1m", "5m", "10m", "30m", "1h"],
  "multi-region": true,
  "max-regions": 99,
  "data-retention": "24 months",
  regions: [
    "ams", "arn", "atl", "bog", "bom", "bos", "cdg", "den", "dfw",
    "ewr", "eze", "fra", "gdl", "gig", "gru", "hkg", "iad", "jnb",
    "lax", "lhr", "mad", "mia", "nrt", "ord", "otp", "phx", "qro",
    "scl", "sea", "sin", "sjc", "syd", "waw", "yul", "yyz",
    "koyeb_fra", "koyeb_was", "koyeb_sin", "koyeb_tyo", "koyeb_par", "koyeb_sfo",
    "railway_europe-west4-drams3a", "railway_us-east4-eqdc4a",
    "railway_asia-southeast1-eqsg3a", "railway_us-west2",
    "self-hosted",
  ],
  "private-locations": true,
  screenshots: true,
  "response-logs": true,
  otel: true,

  // Status page limits
  "status-pages": 9999,
  "page-components": 99999,
  maintenance: true,
  "monitor-values-visibility": true,
  "status-subscribers": true,
  "custom-domain": true,
  i18n: true,
  "password-protection": true,
  "email-domain-protection": true,
  "ip-restriction": true,
  "white-label": true,
  "no-index": true,

  // Notification limits
  notifications: true,
  pagerduty: true,
  opsgenie: true,
  "grafana-oncall": true,
  whatsapp: true,
  sms: true,
  "sms-limit": 99999,
  "notification-channels": 9999,

  // Collaboration limits
  members: "Unlimited",
  "audit-log": true,

  // Other
  "slack-agent": true,
};

async function main() {
  console.log("Connecting to database...");
  const client = createClient({
    url: DATABASE_URL,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });

  // List workspaces before update
  const before = await client.execute("SELECT id, slug, plan FROM workspace");
  console.log(`Found ${before.rows.length} workspace(s):`);
  for (const row of before.rows) {
    console.log(`  id=${row.id} slug=${row.slug} plan=${row.plan}`);
  }

  if (before.rows.length === 0) {
    console.log("No workspaces found. Run db-seed first.");
    process.exit(0);
  }

  // Update all workspaces to scale plan with self-hosted limits
  const limitsJson = JSON.stringify(SELF_HOSTED_LIMITS);
  console.log("\nUpdating workspaces...");

  const result = await client.execute({
    sql: "UPDATE workspace SET plan = ?, limits = ?",
    args: ["scale", limitsJson],
  });

  console.log(`Updated ${result.rowsAffected} workspace(s).`);

  // Verify
  console.log("\nVerification:");
  const after = await client.execute(
    "SELECT id, slug, plan, limits FROM workspace",
  );
  for (const row of after.rows) {
    const parsed = JSON.parse(String(row.limits || "{}"));
    const featureCount = Object.keys(parsed).length;
    console.log(
      `  id=${row.id} slug=${row.slug} plan=${row.plan} limits_keys=${featureCount}`,
    );
  }

  console.log("\nDone. All features unlocked for self-hosted deployment.");
  process.exit(0);
}

main().catch((e) => {
  console.error("Failed to unlock features:", e);
  process.exit(1);
});
