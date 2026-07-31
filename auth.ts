import type { Env, TelegramUpdate, RequestContext } from "../lib/types";
import { upsertUser, resolveRole } from "../lib/kv";

/**
 * Builds the RequestContext from a raw Telegram update: identifies the user,
 * chat, and message/callback content. Also upserts a lightweight user record
 * so "lastSeenAt" / "joinedAt" stay accurate for every interaction.
 *
 * Returns null if the update cannot be attributed to a user (e.g. channel
 * posts with no `from` field) — callers should silently ignore these.
 */
export async function authenticate(env: Env, update: TelegramUpdate): Promise<RequestContext | null> {
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = cq.message?.chat.id ?? cq.from.id;

    await upsertUser(env, cq.from.id, {
      username: cq.from.username,
      firstName: cq.from.first_name,
    });

    const role = await resolveRole(env, cq.from.id);

    return {
      env,
      update,
      userId: cq.from.id,
      chatId,
      role,
      isCallback: true,
      callbackData: cq.data,
    };
  }

  const message = update.message ?? update.edited_message;
  if (!message || !message.from) return null;

  await upsertUser(env, message.from.id, {
    username: message.from.username,
    firstName: message.from.first_name,
  });

  const role = await resolveRole(env, message.from.id);

  return {
    env,
    update,
    userId: message.from.id,
    chatId: message.chat.id,
    role,
    isCallback: false,
    text: message.text,
  };
}
