/**
 * Simple structured logger that respects LOG_LEVEL.
 *
 * Levels: debug < info < error
 *   debug — all messages including per-request traffic and tRPC calls
 *   info  — startup, route hits, errors (default)
 *   error — only failures
 */
import { env } from "../env";

const LEVELS = { debug: 0, info: 1, error: 2 } as const;
type Level = keyof typeof LEVELS;

const currentLevel: Level = env.LOG_LEVEL as Level;

function shouldLog(level: Level): boolean {
  return LEVELS[level] >= LEVELS[currentLevel];
}

function timestamp(): string {
  return new Date().toISOString();
}

export const logger = {
  debug(context: string, msg: string, data?: Record<string, unknown>) {
    if (!shouldLog("debug")) return;
    const extra = data ? ` ${JSON.stringify(data)}` : "";
    console.debug(`[${timestamp()}] [DEBUG] [${context}] ${msg}${extra}`);
  },

  info(context: string, msg: string, data?: Record<string, unknown>) {
    if (!shouldLog("info")) return;
    const extra = data ? ` ${JSON.stringify(data)}` : "";
    console.log(`[${timestamp()}] [INFO] [${context}] ${msg}${extra}`);
  },

  error(context: string, msg: string, err?: unknown) {
    // Always log errors regardless of level
    const errMsg =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : "";
    console.error(
      `[${timestamp()}] [ERROR] [${context}] ${msg}${errMsg ? `: ${errMsg}` : ""}`,
    );
  },

  /**
   * Log an incoming HTTP request and its response.
   * Only fires at debug level.
   */
  request(method: string, path: string, status: number, durationMs: number) {
    if (!shouldLog("debug")) return;
    const statusIcon = status < 400 ? "✓" : status < 500 ? "⚠" : "✗";
    console.log(
      `[${timestamp()}] [DEBUG] [http] ${statusIcon} ${method} ${path} → ${status} (${durationMs}ms)`,
    );
  },
};
