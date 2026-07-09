# Notification System — Gaps & Feature Planning

> Generated 2026-07-09 from codebase analysis of `apps/workflows`, `packages/notifications`, `packages/services/src/notification`, `packages/db/src/schema/notifications`, and `apps/dashboard`.

## Overview

The notification system has three layers — CRUD (services + API), dispatch (workflows + providers), and dashboard (UI) — and supports 13 channels. This document focuses on what's missing for production-grade reliability and observability.

---

## 1. No Persistent Delivery Queue

### Current state

Notifications are dispatched synchronously inside the `triggerNotifications` function (`apps/workflows/src/checker/alerting.ts`). The only retry is in-process:

```ts
Effect.retry({
  times: 3,
  schedule: Schedule.exponential("1000 millis"),
})
Effect.runPromise(result).catch((err) =>
  logger.error("Failed to send ... notification", { ... }),
)
```

After 3 retries (~7 seconds total), the notification is **permanently lost**.

- ❌ No outbox table
- ❌ No persistent queue (Redis, QStash, or DB-backed)
- ❌ No dead-letter queue
- ❌ No administrative re-drive mechanism
- ❌ QStash is used for check scheduling but **not** for notification dispatch

### Impact

Transient provider outages (Slack API down for 10 seconds, rate limits, DNS blips) cause permanent notification loss.

### Possible approaches

| Approach | Effort | Reliability |
|---|---|---|
| **DB outbox pattern** — insert pending notification rows, background worker polls and sends | Medium | High (transactional, survives crashes) |
| **QStash** — ship each notification as an `fetch` to QStash with retry + DLQ config | Low | High (managed retry, already in stack) |
| **Redis-backed queue** (BullMQ / Upstash) | Medium | Medium-High |
| **Effect-based persistent retry** — persist Effect fiber state to DB | High | High |

---

## 2. Dedup Happens Before Send — Blocks Re-delivery

### Current behavior

`notificationTrigger` row is inserted (`alerting.ts:130-137`) **before** `providerToFunction[...].sendAlert()`:

```
1. insertNotificationTrigger()   ← row persisted
2. sendAlert()                    ← may fail all 3 retries
```

The table has `unique(notificationId, monitorId, cronTimestamp)`.

### Impact

If all retries fail (or the process crashes mid-send), the next monitoring cycle hits:

```
logger.error("notification trigger already exists dont send again");
continue;  // notification permanently skipped
```

The notification is lost and cannot be re-sent through the normal flow.

### Fix direction

Move the trigger insert to **after** a successful send, or add a `delivery_status` column (`pending` → `sent` / `failed`) so the dedup only blocks `sent` rows.

---

## 3. No Delivery Status Tracking

### Current state

| Mechanism | Records send? | Records success/failure? | Survives crash? |
|---|---|---|---|
| `notificationTrigger` row | Yes (before send) | ❌ No status column | ✅ DB |
| `notification.sent` Tinybird audit | Yes (after send) | ❌ No status field | ❌ Best-effort only |
| Logger | Yes | ✅ Error messages in logs | ❌ Ephemeral |

The Tinybird `notification.sent` event fires regardless of success or failure and carries no `deliveryStatus` field.

### Fix direction

Add a `delivery_status` column to `notificationTrigger`:

```sql
ALTER TABLE notification_trigger ADD COLUMN delivery_status TEXT
  CHECK(delivery_status IN ('pending', 'sent', 'failed')) DEFAULT 'pending';
```

Update `notification.sent` Tinybird schema to include `delivery_status` and `error_message`.

---

## 4. No Dashboard Visibility into Notification History

### Current state

- Dashboard shows notification **configuration** (name, provider, linked monitors) via DataTable
- Dashboard shows **no** history of sends, delivery statuses, or failures
- No API endpoint exposes `notificationTrigger` rows or send history
- No alert when a notification channel consistently fails

### What's needed

| Feature | Priority |
|---|---|
| "Recent sends" table per notification (last N deliveries with status) | High |
| Per-monitor notification timeline alongside incident timeline | Medium |
| Delivery failure alerting (e.g., Slack webhook returns 400 for 3 consecutive cycles) | Medium |
| "Send test notification" history | Low |

---

## 5. No SMS Quota Visibility

### Current state

SMS quota is checked in `triggerNotifications` by counting `notificationTrigger` rows in the last 30 days vs `workspace.limits["sms-limit"]`. If exceeded, notifications are silently skipped:

```ts
if ((smsSent[0]?.count ?? 0) > data.limits["sms-limit"]) {
  logger.warn(`SMS quota exceeded for workspace ${workspaceId}`);
  continue;
}
```

- ❌ Dashboard doesn't show current SMS usage vs limit
- ❌ No "approaching quota" warning
- ❌ Quota-exceeded events aren't surfaced as `notification.sent` audit events

---

## 6. Audit Log Coverage Gaps

### DB audit log (`packages/db/src/schema/audit_logs/`)

Registered actions:
- ✅ `notification.create`
- ✅ `notification.update`
- ✅ `notification.delete`
- ❌ `notification.sent` — not in DB audit, only in Tinybird's best-effort pipe

### Tinybird checker audit

- `notification.sent` exists but is marked `// ALPHA` and silently dropped when Tinybird isn't configured
- No delivery status in metadata
- No failure-specific event (e.g., `notification.failed`)

---

## 7. Provider-Level Concerns

| Provider | Observations |
|---|---|
| **Slack** | No webhook URL health check; 400/403 responses after token revocation go undetected |
| **Discord** | Same as Slack — no proactive webhook validation after creation |
| **Email (Resend)** | Resend API has its own retry; `sendAlert` doesn't handle Resend-specific error codes |
| **SMS (Twilio)** | Already has quota check; no "insufficient balance" detection |
| **PagerDuty** | Integration key validation only happens at send time |
| **Webhook** | No response validation; any HTTP response is treated as success |
| **Ntfy** | Token and server URL not validated at creation time |

### Improvement

Add a `validateProviderConfig(provider, data)` step that runs:
- On `sendTestNotification` (already exists in ConnectRPC v2 handler)
- On create/update (before persisting)
- Periodically as a health check (new feature)

---

## Summary Matrix

| Gap | Severity | Data-loss risk | Existing mechanism to improve |
|---|---|---|---|
| No persistent queue | **High** | Yes — permanent | Add QStash or DB outbox |
| Dedup before send | **High** | Yes — blocks re-delivery | Move insert after success, add status column |
| No delivery status | **High** | Visibility gap | Add `delivery_status` to `notificationTrigger` |
| No dashboard history | **Medium** | No | New API endpoint + UI |
| No SMS quota UI | **Low** | No | New API endpoint + UI widget |
| Audit gaps | **Medium** | No | Add `notification.sent` to DB audit, add status to Tinybird event |
| Provider validation | **Medium** | Indirect | `validateProviderConfig` on create/update |
