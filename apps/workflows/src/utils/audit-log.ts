import { AuditLog, Tinybird } from "@openstatus/tinybird";

import { env } from "../env";

const token = env().TINY_BIRD_API_KEY;
const tb = token ? new Tinybird({ token }) : null;

const realAudit = tb ? new AuditLog({ tb }) : null;

// Wrapper that silently ignores Tinybird failures — audit log is non-critical
// and self-hosted setups may not have the audit_log__v0 datasource deployed.
export const checkerAudit = {
  async publishAuditLog(
    ...args: Parameters<AuditLog["publishAuditLog"]>
  ): Promise<void> {
    if (!realAudit) return;
    try {
      await realAudit.publishAuditLog(...args);
    } catch {
      // audit log is best-effort — silently ignore failures
    }
  },
};
