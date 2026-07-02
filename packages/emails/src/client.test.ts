import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

// SKIP: bun's mock.module cannot intercept the named import binding of
// { sendBatchEmailHtml } in client.tsx, so the mock is never called.
// The idempotency-key logic is covered by the integration-level tests in
// packages/subscriptions/src/channels/email.test.ts, which verify the
// key is computed and passed correctly at the sendStatusReportUpdate call site.
//
// To re-enable, use a DI pattern (accept send functions via constructor) or
// switch to vitest with vi.mock which handles ESM live bindings correctly.

// biome-ignore lint/suspicious/noExplicitAny: bun mock handle
const sendBatchEmailHtmlMock = mock(() => Promise.resolve(undefined));
mock.module("./send", () => ({
  sendBatchEmailHtml: sendBatchEmailHtmlMock,
  sendHtmlEmail: mock(() => Promise.resolve(undefined)),
  sendWithRender: mock(() => Promise.resolve(undefined)),
  sendEmail: mock(() => Promise.resolve(undefined)),
  setWorkspaceEmailConfig: mock(() => {}),
}));

mock.module("effect", () => {
  const actual = require("effect");
  return {
    ...actual,
    Schedule: {
      ...actual.Schedule,
      exponential: () => actual.Schedule.once,
    },
  };
});

process.env.NODE_ENV = "production";

const { EmailClient } = await import("./client");

function makeSubscribers(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    email: `user-${i}@example.com`,
    token: `token-${i}`,
  }));
}

// biome-ignore lint/suspicious/noExplicitAny: test helper type
function baseReq(overrides: Record<string, any> = {}) {
  return {
    subscribers: makeSubscribers(1),
    pageSlug: "demo",
    pageTitle: "Demo",
    reportTitle: "Outage",
    status: "investigating" as const,
    date: "2026-04-21T09:59:58Z",
    message: "We are investigating.",
    pageComponents: [] as string[],
    ...overrides,
  };
}

describe.skip("EmailClient.sendStatusReportUpdate - idempotency & chunking", () => {
  let client: InstanceType<typeof EmailClient>;

  beforeEach(() => {
    client = new EmailClient({ apiKey: "re_test_123" });
    sendBatchEmailHtmlMock.mockClear();
    sendBatchEmailHtmlMock.mockImplementation(() =>
      Promise.resolve(undefined),
    );
  });

  test("passes the base idempotency key suffixed with the batch index", async () => {
    await client.sendStatusReportUpdate(
      baseReq({ idempotencyKey: "status-report-update:5" }),
    );

    expect(sendBatchEmailHtmlMock).toHaveBeenCalledTimes(1);
    const [, opts] = sendBatchEmailHtmlMock.mock.calls[0];
    expect(opts).toEqual({ idempotencyKey: "status-report-update:5:0" });
  });

  test("gives each 100-recipient chunk a distinct key and its own slice", async () => {
    await client.sendStatusReportUpdate(
      baseReq({
        subscribers: makeSubscribers(250),
        idempotencyKey: "status-report-update:9",
      }),
    );

    expect(sendBatchEmailHtmlMock).toHaveBeenCalledTimes(3);
    const keys = sendBatchEmailHtmlMock.mock.calls.map(
      // biome-ignore lint/suspicious/noExplicitAny: positional spy args
      ([, o]: [unknown, any]) => o?.idempotencyKey,
    );
    expect(keys).toEqual([
      "status-report-update:9:0",
      "status-report-update:9:1",
      "status-report-update:9:2",
    ]);
    const sizes = sendBatchEmailHtmlMock.mock.calls.map(
      // biome-ignore lint/suspicious/noExplicitAny: positional spy args
      ([payload]: [any[]]) => payload.length,
    );
    expect(sizes).toEqual([100, 100, 50]);
  });

  test("omits the option entirely when no base key is provided", async () => {
    await client.sendStatusReportUpdate(baseReq());

    expect(sendBatchEmailHtmlMock).toHaveBeenCalledTimes(1);
    const [, opts] = sendBatchEmailHtmlMock.mock.calls[0];
    expect(opts).toBeUndefined();
  });

  test("reuses the same key across a retry so Resend dedupes the resend", async () => {
    let callCount = 0;
    sendBatchEmailHtmlMock.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error("Resend batch error"));
      }
      return Promise.resolve(undefined);
    });

    await client.sendStatusReportUpdate(
      baseReq({ idempotencyKey: "status-report-update:7" }),
    );

    expect(sendBatchEmailHtmlMock).toHaveBeenCalledTimes(2);
    const keys = sendBatchEmailHtmlMock.mock.calls.map(
      // biome-ignore lint/suspicious/noExplicitAny: positional spy args
      ([, o]: [unknown, any]) => o?.idempotencyKey,
    );
    expect(keys).toEqual([
      "status-report-update:7:0",
      "status-report-update:7:0",
    ]);
  });
});
