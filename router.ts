import type { Env, TelegramUpdate, RequestContext } from "./lib/types";
import { authenticate } from "./middleware/auth";
import { authorize } from "./middleware/rbac";
import { validate, parseCallback } from "./middleware/validation";
import { audit } from "./middleware/audit";
import { sendMessage, answerCallbackQuery } from "./lib/telegram";

import * as general from "./handlers/general";
import * as admin from "./handlers/admin";
import * as owner from "./handlers/owner";

type Handler = (ctx: RequestContext) => Promise<void>;

// Command name -> handler
const COMMAND_HANDLERS: Record<string, Handler> = {
  start: general.handleStart,
  help: general.handleHelp,
  announcements: general.handleAnnouncements,
  info: general.handleInfo,
  faq: general.handleFaq,
  events: general.handleEvents,
  event: general.handleEvents, // alias; also handles admin "/event cancel <id>"
  survey: general.handleSurvey,
  docs: general.handleDocs,
  status: general.handleStatus,
  ticket: general.handleTicket,
  submit: general.handleSubmit,

  announce: admin.handleAnnounce,
  createevent: admin.handleCreateEvent,
  createsurvey: admin.handleCreateSurvey,
  closesurvey: admin.handleCloseSurvey,
  schedules: admin.handleListSchedules,
  schedule: admin.handleSchedule, // alias
  createschedule: admin.handleCreateSchedule,
  tickets: admin.handleTickets,
  resolve: admin.handleResolve,
  adddoc: admin.handleAddDoc,
  addfaq: admin.handleAddFaq,

  setrole: owner.handleSetRole,
  roles: owner.handleRoles,
  permissions: owner.handlePermissions,
  config: owner.handleConfig,
  logs: owner.handleLogs,
  report: owner.handleReport,
  broadcast: owner.handleBroadcast,
};

// Callback action (2nd segment of "gen:action:...") -> handler
const CALLBACK_HANDLERS: Record<string, Handler> = {
  join: general.handleJoinCallback,
  vote: general.handleVoteCallback,
  doc: general.handleDocCallback,
  faq: general.handleFaqCallback,
  resolve: admin.handleResolveCallback,
  deldoc: admin.handleDeleteDocCallback,
  toggleschedule: admin.handleToggleScheduleCallback,
};

/**
 * Processes a single Telegram update end-to-end:
 * authenticate -> validate -> authorize -> dispatch -> audit log.
 */
export async function routeUpdate(env: Env, update: TelegramUpdate): Promise<void> {
  const ctx = await authenticate(env, update);
  if (!ctx) return; // nothing attributable to a user (e.g. channel post)

  const validation = validate(ctx);
  if (!validation.valid) {
    console.warn(`Validation failed for user ${ctx.userId}: ${validation.error}`);
    return;
  }

  if (ctx.env.OWNER_TELEGRAM_ID && ctx.userId && String(ctx.userId) === ctx.env.OWNER_TELEGRAM_ID) {
    // Ensure the configured owner always resolves to the owner role even on
    // their very first interaction, before a KV user record exists.
    ctx.role = "owner";
  }

  if (!authorize(ctx)) {
    await audit(ctx, "denied", ctx.isCallback ? ctx.callbackData : ctx.text);
    const message = "You don't have permission to do that.";
    if (ctx.isCallback) {
      const cq = update.callback_query;
      if (cq) await answerCallbackQuery(env, cq.id, message, true);
    } else {
      await sendMessage(env, ctx.chatId, message);
    }
    return;
  }

  try {
    if (ctx.isCallback && ctx.callbackData) {
      const action = parseCallback(ctx.callbackData)[1];
      const handler = CALLBACK_HANDLERS[action];
      const cq = update.callback_query;

      if (handler) {
        await handler(ctx);
        if (cq) await answerCallbackQuery(env, cq.id);
      } else if (cq) {
        await answerCallbackQuery(env, cq.id, "Unknown action.", true);
      }

      await audit(ctx, `callback:${action}`, ctx.callbackData);
      return;
    }

    if (!ctx.isCallback && ctx.text?.startsWith("/")) {
      const command = ctx.text.slice(1).split(/[\s@]/)[0].toLowerCase();
      const handler = COMMAND_HANDLERS[command];

      if (handler) {
        await handler(ctx);
      } else {
        await sendMessage(env, ctx.chatId, "Unknown command. Try /help.");
      }

      await audit(ctx, `command:${command}`, ctx.text);
      return;
    }

    // Plain, non-command text: no-op for now (extend for conversational flows).
  } catch (err) {
    console.error("Handler error:", err);
    await sendMessage(env, ctx.chatId, "Something went wrong processing that. Please try again.");
    await audit(ctx, "error", String(err));
  }
}
