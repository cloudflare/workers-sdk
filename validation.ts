import type { RequestContext } from "../lib/types";

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

const MAX_TEXT_LENGTH = 4096; // Telegram's own message length ceiling
const MAX_CALLBACK_LENGTH = 64; // Telegram's own callback_data length ceiling

/**
 * Baseline structural validation applied to every update before it reaches
 * business logic. Command-specific argument validation happens inside each
 * handler, closer to where the arguments are actually used.
 */
export function validate(ctx: RequestContext): ValidationResult {
  if (ctx.userId === undefined || ctx.chatId === undefined) {
    return { valid: false, error: "Missing user or chat identity." };
  }

  if (!ctx.isCallback && ctx.text !== undefined && ctx.text.length > MAX_TEXT_LENGTH) {
    return { valid: false, error: "Message text exceeds maximum allowed length." };
  }

  if (ctx.isCallback && ctx.callbackData !== undefined && ctx.callbackData.length > MAX_CALLBACK_LENGTH) {
    return { valid: false, error: "Callback data exceeds maximum allowed length." };
  }

  if (ctx.isCallback && !ctx.callbackData) {
    return { valid: false, error: "Callback query missing data payload." };
  }

  return { valid: true };
}

/** Splits "/command arg1 arg2" into ["arg1", "arg2"]. */
export function parseArgs(text: string): string[] {
  return text.trim().split(/\s+/).slice(1);
}

/** Splits callback_data "admin:announce:123" into its colon-separated parts. */
export function parseCallback(data: string): string[] {
  return data.split(":");
}
