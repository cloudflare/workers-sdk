import type { Env } from "./types";

const API_BASE = "https://api.telegram.org";

function apiUrl(token: string, method: string): string {
  return `${API_BASE}/bot${token}/${method}`;
}

async function call(env: Env, method: string, payload: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(apiUrl(env.TELEGRAM_BOT_TOKEN, method), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    console.error(`Telegram API error on ${method}: ${res.status} ${errBody}`);
  }

  return res.json().catch(() => null);
}

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export async function sendMessage(
  env: Env,
  chatId: number,
  text: string,
  options: {
    replyMarkup?: InlineKeyboardButton[][];
    parseMode?: "Markdown" | "MarkdownV2" | "HTML";
  } = {}
): Promise<unknown> {
  return call(env, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: options.parseMode ?? "Markdown",
    reply_markup: options.replyMarkup ? { inline_keyboard: options.replyMarkup } : undefined,
  });
}

export async function editMessageText(
  env: Env,
  chatId: number,
  messageId: number,
  text: string,
  replyMarkup?: InlineKeyboardButton[][]
): Promise<unknown> {
  return call(env, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "Markdown",
    reply_markup: replyMarkup ? { inline_keyboard: replyMarkup } : undefined,
  });
}

export async function answerCallbackQuery(
  env: Env,
  callbackQueryId: string,
  text?: string,
  showAlert = false
): Promise<unknown> {
  return call(env, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: showAlert,
  });
}

export async function setWebhook(env: Env, url: string): Promise<unknown> {
  return call(env, "setWebhook", {
    url,
    secret_token: env.WEBHOOK_SECRET,
    allowed_updates: ["message", "callback_query"],
  });
}

export async function deleteWebhook(env: Env): Promise<unknown> {
  return call(env, "deleteWebhook", {});
}
