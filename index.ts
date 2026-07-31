import type { Env, TelegramUpdate } from "./lib/types";
import { routeUpdate } from "./router";
import { handleScheduled } from "./scheduled/jobs";

export default {
  /**
   * Handles incoming HTTPS requests — this is where the Telegram webhook
   * delivers updates. Validates the shared secret header before processing.
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("TeamMarySy Bot is running.", { status: 200 });
    }

    // Verify the request actually came from Telegram, not a spoofed caller.
    // Set via: setWebhook(env, url) with secret_token, and store the same
    // value as the WEBHOOK_SECRET secret.
    const secretHeader = request.headers.get("x-telegram-bot-api-secret-token");
    if (secretHeader !== env.WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    let update: TelegramUpdate;
    try {
      update = await request.json();
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    // Respond to Telegram immediately; process the update without blocking
    // the HTTP response (Telegram expects a fast 200 OK).
    // Note: in the free Workers plan there's no true background execution
    // beyond the request lifecycle, so we await here directly. On paid plans
    // consider using `ctx.waitUntil` (add ExecutionContext param) instead.
    await routeUpdate(env, update);

    return new Response("OK", { status: 200 });
  },

  /**
   * Handles Cloudflare Cron Triggers as configured in wrangler.toml.
   */
  async scheduled(event: ScheduledController, env: Env): Promise<void> {
    await handleScheduled(env, event.cron);
  },
};
