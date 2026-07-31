import type { RequestContext } from "../lib/types";
import { writeLog } from "../lib/kv";

/**
 * Writes an audit trail entry for every processed update. Kept lightweight
 * and non-blocking-critical: failures here should never break the bot's
 * response to the user, so callers should fire this without awaiting on the
 * critical path where possible (e.g. via ctx.waitUntil in index.ts).
 */
export async function audit(ctx: RequestContext, action: string, detail?: string): Promise<void> {
  await writeLog(ctx.env, {
    at: new Date().toISOString(),
    userId: ctx.userId,
    role: ctx.role,
    action,
    detail,
  });
}
